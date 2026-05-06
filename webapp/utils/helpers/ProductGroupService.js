/**
 * ProductGroupService.js
 * 
 * Frontend service for grouping activities by product.
 * Groups activities based on UDF values (Z_ProductDescription, Z_ActParentItemID).
 * 
 * Key Features:
 * - Extract UDF values from activity objects
 * - Group activities by product description and parent item ID
 * - Sort groups by SO Item ID, then by product description
 * - Sort activities within groups by external ID
 * 
 * Group Structure:
 * {
 *   key: "Product Name|||8200001975/100",
 *   productDescription: "Product Name",
 *   soItemId: "8200001975/100",
 *   parentItemId: "100",
 *   activities: [...]
 * }
 * 
 * @file ProductGroupService.js
 * @module com/tng/fsm/timematerialext/app/utils/helpers/ProductGroupService
 */
sap.ui.define([], () => {
    "use strict";

    return {
        /**
         * Extract UDF value by externalId from activity's udfValues array.
         * @param {Object} activity - Activity object with udfValues array
         * @param {string} udfExternalId - UDF external ID (e.g., "Z_ProductDescription")
         * @returns {string|null} UDF value or null if not found
         */
        getUdfValue(activity, udfExternalId) {
            if (!activity.udfValues || !Array.isArray(activity.udfValues)) {
                return null;
            }

            const udfValue = activity.udfValues.find(udf =>
                udf.udfMeta && udf.udfMeta.externalId === udfExternalId
            );

            return udfValue ? udfValue.value : null;
        },

        /**
         * Group activities by Product Description and Parent Item ID.
         * @param {Array} activities - Array of activity objects
         * @param {string} serviceOrderCode - Service order code for SO Item ID construction
         * @returns {Array} Array of product groups with their activities
         */
        groupActivitiesByProduct(activities, serviceOrderCode) {
            const groups = {};

            activities.forEach(activity => {
                const productDescription = this.getUdfValue(activity, 'Z_ProductDescription');
                const parentItemId = this.getUdfValue(activity, 'Z_ActParentItemID');

                // Skip if no product description
                if (!productDescription) {
                    return;
                }

                // Create SO Item ID (e.g., "8200001975/100")
                const soItemId = parentItemId
                    ? `${serviceOrderCode}/${parentItemId}`
                    : serviceOrderCode;

                // Create unique group key
                const groupKey = `${productDescription}|||${soItemId}`;

                // Initialize group if doesn't exist
                if (!groups[groupKey]) {
                    groups[groupKey] = {
                        key: groupKey,
                        productDescription: productDescription,
                        soItemId: soItemId,
                        parentItemId: parentItemId || '',
                        activities: []
                    };
                }

                // Add activity to group
                groups[groupKey].activities.push({
                    id: activity.id,
                    code: activity.code,
                    subject: activity.subject,
                    status: activity.status,
                    executionStage: activity.executionStage,
                    type: activity.type,
                    plannedStartDate: activity.plannedStartDate,
                    plannedEndDate: activity.plannedEndDate,
                    fullActivity: activity
                });
            });

            // Convert to array and sort
            const groupArray = Object.values(groups);

            // Sort by SO Item ID, then by Product Description
            groupArray.sort((a, b) => {
                if (a.soItemId !== b.soItemId) {
                    return a.soItemId.localeCompare(b.soItemId);
                }
                return a.productDescription.localeCompare(b.productDescription);
            });

            // Sort activities within each group by external ID
            groupArray.forEach(group => {
                group.activities.sort((a, b) => {
                    const externalIdA = a.fullActivity?.externalId || a.code || '';
                    const externalIdB = b.fullActivity?.externalId || b.code || '';
                    return externalIdA.localeCompare(externalIdB);
                });
            });

            return groupArray;
        },

        /**
         * Format product group title for display.
         * @param {string} productDescription - Product description
         * @param {string} soItemId - SO Item ID
         * @returns {string} Formatted title
         */
        formatProductGroupTitle(productDescription, soItemId) {
            return `Product: ${productDescription} | ID: ${soItemId}`;
        }
    };
});