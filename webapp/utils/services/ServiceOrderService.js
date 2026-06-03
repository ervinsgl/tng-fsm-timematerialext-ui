/**
 * ServiceOrderService.js
 * 
 * Frontend service for service order/call data management.
 * Handles fetching and extracting data from FSM composite-tree API responses.
 * 
 * Key Features:
 * - Fetch service call by ID using composite-tree API
 * - Extract service order header data (ID, subject, business partner, responsible)
 * - Extract activities array from composite response
 * 
 * API Endpoint Used:
 * - POST /api/get-activities-by-service-call (uses composite-tree API)
 * 
 * Response Structure:
 * The composite-tree API returns service call at ROOT level with nested activities.
 * 
 * @file ServiceOrderService.js
 * @module com/tns/fsm/timematerialext/app/utils/services/ServiceOrderService
 */
sap.ui.define([], () => {
    "use strict";

    return {
        /**
         * Fetch service call details by ID.
         * @param {string} serviceCallId - Service call ID
         * @returns {Promise<Object>} Composite tree response with service call and activities
         * @throws {Error} If request fails
         */
        async fetchServiceCallById(serviceCallId) {
            const response = await fetch("/api/v1/get-activities-by-service-call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ serviceCallId: serviceCallId })
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch service call: ${response.status}`);
            }

            return await response.json();
        },

        /**
         * Extract service order data from composite-tree response.
         * In composite-tree API, service call data is at ROOT level.
         * @param {Object} compositeData - Composite tree API response
         * @returns {Object|null} Extracted service order data or null
         */
        extractServiceOrderData(compositeData) {
            if (!compositeData) {
                return null;
            }
            
            // Extract business partner external ID
            let businessPartnerExternalId = null;
            if (compositeData.businessPartner && compositeData.businessPartner.externalId) {
                businessPartnerExternalId = compositeData.businessPartner.externalId;
            }
            
            // Extract responsible external ID (first responsible if multiple)
            let responsibleExternalId = null;
            if (compositeData.responsibles && compositeData.responsibles.length > 0) {
                responsibleExternalId = compositeData.responsibles[0].externalId || 
                                       compositeData.responsibles[0].code ||
                                       compositeData.responsibles[0].id;
            }
            
            return {
                id: compositeData.id,
                externalId: compositeData.externalId || compositeData.code || compositeData.id,
                subject: compositeData.subject || '',
                businessPartnerExternalId: businessPartnerExternalId || 'N/A',
                responsibleExternalId: responsibleExternalId || 'N/A',
                earliestStartDateTime: compositeData.earliestStartDateTime || null,
                dueDateTime: compositeData.dueDateTime || null
            };
        },

        /**
         * Extract activities array from composite-tree response.
         * @param {Object} compositeData - Composite tree API response
         * @returns {Array} Array of activity objects
         */
        extractActivitiesFromCompositeTree(compositeData) {
            if (!compositeData || !compositeData.activities) {
                return [];
            }
            
            return compositeData.activities || [];
        }
    };
});