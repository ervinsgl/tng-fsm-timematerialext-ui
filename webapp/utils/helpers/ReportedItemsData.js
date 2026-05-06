/**
 * ReportedItemsData.js
 * 
 * Frontend service for fetching T&M (Time & Materials) reported items.
 * Retrieves all reported items for an activity from the backend.
 * 
 * T&M Entry Types:
 * - TIME_EFFORT: Time entries
 * - MATERIAL: Material/parts entries
 * - EXPENSE: Expense entries
 * - MILEAGE: Mileage/travel entries
 * 
 * API Endpoint Used:
 * - POST /api/get-reported-items
 * 
 * @file ReportedItemsData.js
 * @module com/tng/fsm/timematerialext/app/utils/helpers/ReportedItemsData
 */
sap.ui.define([], () => {
    "use strict";

    return {
        /**
         * Fetch all reported items (Time Effort, Material, Expense, Mileage) for an activity.
         * @param {string} activityId - Activity ID to fetch items for
         * @returns {Promise<Array>} Array of reported items
         * @throws {Error} If activityId is missing or request fails
         */
        async getReportedItems(activityId) {
            if (!activityId) {
                throw new Error("Activity ID is required");
            }

            try {
                const response = await fetch("/api/v1/get-reported-items", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ activityId })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || `Failed to fetch reported items: ${response.status}`);
                }

                const data = await response.json();
                return data.items || [];

            } catch (error) {
                console.error("ReportedItemsData: Error fetching reported items:", error);
                throw error;
            }
        }
    };
});