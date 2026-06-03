/**
 * ActivityService.js
 * 
 * Frontend service for activity data management.
 * Handles fetching activities from backend and extracting structured data.
 * 
 * Key Features:
 * - Format activity IDs (UUID â†’ FSM format)
 * - Fetch single activity by ID
 * - Fetch activities for a service call
 * - Extract activity and service call data from responses
 * 
 * API Endpoints Used:
 * - POST /api/get-activity-by-id
 * - POST /api/get-activities-by-service-call
 * 
 * @file ActivityService.js
 * @module com/tns/fsm/timematerialext/app/utils/services/ActivityService
 */
sap.ui.define([], () => {
    "use strict";

    return {
        /**
         * Format activity ID for FSM API.
         * Converts UUID format to FSM's uppercase format.
         * @param {string} activityId - UUID format (e.g., "77f485d3-c917-49db-8da3-c4045d95c2b9")
         * @returns {string} FSM format (e.g., "77F485D3C91749DB8DA3C4045D95C2B9")
         */
        formatActivityId(activityId) {
            if (!activityId) return "";
            return activityId.replace(/-/g, '').toUpperCase();
        },

        /**
         * Fetch activity by ID from backend.
         * @param {string} activityId - Activity ID (UUID or FSM format)
         * @returns {Promise<Object>} Activity data from FSM API
         * @throws {Error} If request fails
         */
        async fetchActivityById(activityId) {
            const formattedId = this.formatActivityId(activityId);
            
            const response = await fetch("/api/v1/get-activity-by-id", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ activityId: formattedId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP ${response.status}`);
            }

            return await response.json();
        },

        /**
         * Extract activity data from FSM response.
         * @param {Object} response - FSM API response
         * @returns {Object} Structured activity data
         */
        extractActivityData(response) {
            const activity = response.data?.[0]?.activity || response;
            
            return {
                id: activity.id,
                code: activity.code,
                subject: activity.subject,
                createPerson: activity.createPerson,
                type: activity.type,
                status: activity.status,
                startDateTime: activity.startDateTime,
                endDateTime: activity.endDateTime,
                object: activity.object,
                rawData: activity
            };
        },

        /**
         * Extract service call data from activity.
         * @param {Object} activity - Activity object with object reference
         * @returns {Object|null} Service call data or null if not available
         */
        extractServiceCallData(activity) {
            if (!activity.object) return null;
            
            return {
                id: activity.object.objectId,
                subject: activity.subject
            };
        },

        /**
         * Fetch activity technicians (responsible + supportingPersons).
         * Used for T&M report creation to populate technician dropdown.
         * @param {string} activityId - Activity ID
         * @returns {Promise<Object>} Object with responsibleId and supportingPersonIds arrays
         */
        async fetchActivityTechnicians(activityId) {
            const formattedId = this.formatActivityId(activityId);
            
            try {
                const response = await fetch("/api/v1/get-activity-by-id", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ activityId: formattedId })
                });

                if (!response.ok) {
                    return { responsibleIds: [], supportingPersonIds: [] };
                }

                const data = await response.json();
                const activity = data.data?.[0]?.activity || {};
                
                return {
                    responsibleIds: activity.responsibles || [],
                    supportingPersonIds: activity.supportingPersons || []
                };
            } catch (error) {
                console.error('ActivityService: Error fetching activity technicians:', error);
                return { responsibleIds: [], supportingPersonIds: [] };
            }
        }
    };
});