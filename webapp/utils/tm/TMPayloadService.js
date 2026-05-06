/**
 * TMPayloadService.js
 * 
 * Frontend service for building T&M API payloads.
 * Centralizes all payload formatting logic for FSM API submissions.
 * 
 * Key Features:
 * - Build payloads for all T&M entry types
 * - Handle UDF values for custom fields
 * - Extract external IDs from display text
 * - Format combined Time & Material payloads
 * - Handle createPerson with UUID fallback when externalId is missing
 * 
 * Payload Types:
 * - Time Effort: Task-based time entries
 * - Material: Item-based material entries
 * - Expense: Amount-based expense entries
 * - Mileage: Distance-based travel entries
 * - Time & Material: Combined (1 Material + up to 3 Time Efforts)
 * 
 * Common Fields:
 * - orgLevel: Organization level ID
 * - createPerson: Technician (externalId or UUID)
 * - syncStatus: "REQUIRES_APPROVAL"
 * - object: Activity reference
 * 
 * @file TMPayloadService.js
 * @module com/tng/fsm/timematerialext/app/utils/tm/TMPayloadService
 * @requires com/tng/fsm/timematerialext/app/utils/tm/TMCreationService
 * @requires com/tng/fsm/timematerialext/app/utils/services/TimeTaskService
 */
sap.ui.define([
    "com/tng/fsm/timematerialext/app/utils/tm/TMCreationService",
    "com/tng/fsm/timematerialext/app/utils/services/TimeTaskService"
], (TMCreationService, TimeTaskService) => {
    "use strict";

    return {
        /**
         * Build createPerson field for API payload.
         * Uses externalId if available, otherwise uses UUID directly.
         * 
         * FSM API accepts either:
         * - { externalId: "EXT123" } - when person has externalId
         * - "UUID-STRING" - when person has no externalId (direct UUID reference)
         * 
         * @param {string} technicianId - Technician UUID
         * @param {string} technicianExternalId - Technician external ID (may be empty)
         * @returns {Object|string} createPerson value for API
         */
        _buildCreatePerson(technicianId, technicianExternalId) {
            // If we have a valid externalId, use the object format
            if (technicianExternalId && technicianExternalId.trim() !== "") {
                return {
                    externalId: technicianExternalId
                };
            }
            
            // If no externalId but we have UUID, use UUID directly
            if (technicianId && technicianId.trim() !== "") {
                return technicianId;
            }
            
            // Fallback - return empty object (will likely fail validation)
            console.warn("TMPayloadService: No valid technician ID or externalId provided");
            return {
                externalId: ""
            };
        },

        /**
         * Normalize a date string to yyyy-MM-dd for API submission.
         * Handles both yyyy-MM-dd (model format) and dd.MM.yyyy (display format from manual typing).
         * If the string is already yyyy-MM-dd it passes through unchanged.
         * @param {string} sDate - Date string in either format
         * @returns {string|null} Date in yyyy-MM-dd format, or null if unparseable
         * @private
         */
        _normalizeDate(sDate) {
            if (!sDate) return null;
            // Already in API format yyyy-MM-dd
            if (/^\d{4}-\d{2}-\d{2}$/.test(sDate)) return sDate;
            // Display format dd.MM.yyyy (from manual typing in DatePicker)
            if (/^\d{2}\.\d{2}\.\d{4}$/.test(sDate)) {
                const parts = sDate.split('.');
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
            // Shortened display format dd.MM.yy
            if (/^\d{2}\.\d{2}\.\d{2}$/.test(sDate)) {
                const parts = sDate.split('.');
                return `20${parts[2]}-${parts[1]}-${parts[0]}`;
            }
            console.warn("TMPayloadService: unrecognized date format:", sDate);
            return null;
        },

        /**
         * Build payload based on entry type.
         * @param {Object} oEntry - Entry data object
         * @param {string} activityId - Activity ID
         * @param {string} orgLevelId - Organization Level ID
         * @returns {Object} Formatted payload for API
         */
        buildPayload(oEntry, activityId, orgLevelId) {
            switch (oEntry.type) {
                case "Time Effort":
                    return this.buildTimeEffortPayload(oEntry, activityId, orgLevelId);
                case "Material":
                    return this.buildMaterialPayload(oEntry, activityId, orgLevelId);
                case "Expense":
                case "Expense Report":
                    return this.buildExpensePayload(oEntry, activityId, orgLevelId);
                case "Mileage":
                case "Mileage Report":
                    return this.buildMileagePayload(oEntry, activityId, orgLevelId);
                case "Time & Material":
                    return this.buildTimeAndMaterialPayload(oEntry, activityId, orgLevelId);
                default:
                    return { error: "Unknown entry type: " + oEntry.type };
            }
        },

        /**
         * Build Time Effort API payload.
         * chargeOption is always "CHARGEABLE".
         * endDateTime is calculated from startDateTime + duration.
         * @param {Object} oEntry - Time Effort entry data
         * @param {string} activityId - Activity ID
         * @param {string} orgLevelId - Organization Level ID
         * @returns {Object} Time Effort payload
         */
        buildTimeEffortPayload(oEntry, activityId, orgLevelId) {
            // Calculate endDateTime from startDateTime + duration
            let endDateTime = oEntry.endDateTime || "";
            if (oEntry.startDateTime && oEntry.duration) {
                const startDate = new Date(oEntry.startDateTime);
                if (!isNaN(startDate.getTime())) {
                    const endDate = new Date(startDate.getTime() + (oEntry.duration * 60 * 1000));
                    endDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
                }
            }

            return {
                chargeOption: "CHARGEABLE",
                inactive: false,
                startDateTimeTimeZoneId: "Europe/Berlin",
                endDateTimeTimeZoneId: "Europe/Berlin",
                orgLevel: orgLevelId || "",
                breakInMinutes: 0,
                unitPrice: null,
                timeZoneId: "UTC+02:00",
                endDateTime: endDateTime,
                internalRemarks: null,
                breakStartDateTime: null,
                startDateTime: oEntry.startDateTime || "",
                createPerson: this._buildCreatePerson(oEntry.technicianId, oEntry.technicianExternalId),
                task: TimeTaskService.getTaskIdByCode(oEntry.taskCode),
                udfValues: [{
                    meta: {
                        externalId: "Z_TimeEffort_MatID"
                    },
                    value: "Z13000000"
                }],
                remarks: oEntry.remarks || "",
                syncStatus: "REQUIRES_APPROVAL",
                object: {
                    objectId: activityId || "",
                    objectType: "ACTIVITY"
                }
            };
        },

        /**
         * Build Material API payload.
         * Date uses user-selected entryDate, falls back to Activity Planned Start.
         * chargeOption is always "CHARGEABLE".
         * @param {Object} oEntry - Material entry data
         * @param {string} activityId - Activity ID
         * @param {string} orgLevelId - Organization Level ID
         * @returns {Object} Material payload
         */
        buildMaterialPayload(oEntry, activityId, orgLevelId) {
            // Use itemExternalId directly from entry
            const itemExternalId = oEntry.itemExternalId || "";

            // Use user-selected date, fallback to activity planned start, then today
            const activityPlannedStart = TMCreationService.getActivityPlannedStartDate();
            const materialDate = this._normalizeDate(oEntry.entryDate)
                || (activityPlannedStart ? activityPlannedStart.split('T')[0] : null)
                || new Date().toISOString().split('T')[0];

            return {
                chargeOption: "CHARGEABLE",
                inactive: false,
                orgLevel: orgLevelId || "",
                date: materialDate,
                quantity: oEntry.quantity || 0,
                createPerson: this._buildCreatePerson(oEntry.technicianId, oEntry.technicianExternalId),
                item: itemExternalId ? { externalId: itemExternalId } : null,
                remarks: oEntry.remarks || "",
                syncStatus: "REQUIRES_APPROVAL",
                object: {
                    objectId: activityId || "",
                    objectType: "ACTIVITY"
                }
            };
        },

        /**
         * Build Expense API payload.
         * Date uses user-selected entryDate, falls back to Activity Planned Start.
         * chargeOption is always "CHARGEABLE".
         * @param {Object} oEntry - Expense entry data
         * @param {string} activityId - Activity ID
         * @param {string} orgLevelId - Organization Level ID
         * @returns {Object} Expense payload
         */
        buildExpensePayload(oEntry, activityId, orgLevelId) {
            // Get expense type ID (UUID)
            const expenseTypeId = oEntry.expenseTypeId || "";

            // Use user-selected date, fallback to activity planned start, then today
            const activityPlannedStart = TMCreationService.getActivityPlannedStartDate();
            const expenseDate = this._normalizeDate(oEntry.entryDate)
                || (activityPlannedStart ? activityPlannedStart.split('T')[0] : null)
                || new Date().toISOString().split('T')[0];

            return {
                chargeOption: "CHARGEABLE",
                inactive: false,
                orgLevel: orgLevelId || "",
                date: expenseDate,
                externalAmount: {
                    amount: oEntry.externalAmountValue || 0,
                    currency: "EUR"
                },
                internalAmount: {
                    amount: oEntry.internalAmountValue || 0,
                    currency: "EUR"
                },
                createPerson: this._buildCreatePerson(oEntry.technicianId, oEntry.technicianExternalId),
                type: expenseTypeId || null,
                remarks: oEntry.remarks || "",
                syncStatus: "REQUIRES_APPROVAL",
                object: {
                    objectId: activityId || "",
                    objectType: "ACTIVITY"
                }
            };
        },

        /**
         * Build Mileage API payload.
         * Type (Item) externalId goes to UDF value for Z_Mileage_MatID.
         * Source/Destination are blank.
         * travelStartDateTime from Activity Planned Start.
         * travelEndDateTime = travelStartDateTime + Duration.
         * Driver/Private Car default to false.
         * chargeOption is always "CHARGEABLE".
         * @param {Object} oEntry - Mileage entry data
         * @param {string} activityId - Activity ID
         * @param {string} orgLevelId - Organization Level ID
         * @returns {Object} Mileage payload
         */
        buildMileagePayload(oEntry, activityId, orgLevelId) {
            // Get activity planned start date for travel times
            const activityPlannedStart = TMCreationService.getActivityPlannedStartDate();
            
            // Use user-selected date, fallback to activity planned start, then today
            const userDate = this._normalizeDate(oEntry.entryDate)
                || (activityPlannedStart ? activityPlannedStart.split('T')[0] : null)
                || new Date().toISOString().split('T')[0];
            
            // Build travel start from user date + time portion from planned start
            const timePortion = activityPlannedStart 
                ? activityPlannedStart.split('T')[1] || '12:00:00Z'
                : '12:00:00Z';
            const baseStartDateTime = `${userDate}T${timePortion}`;
            
            // Calculate travel end time: start + duration
            const startDate = new Date(baseStartDateTime);
            const endDate = new Date(startDate.getTime() + (oEntry.travelDuration || 0) * 60 * 1000);
            
            const formatDateTime = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
            
            // Use itemExternalId directly from entry
            const itemExternalId = oEntry.itemExternalId || "";

            return {
                date: userDate,
                orgLevel: orgLevelId || "",
                distanceUnit: "KM",
                distance: oEntry.distance || 0,
                destination: "",
                source: "",
                type: null,
                travelEndDateTime: formatDateTime(endDate),
                chargeOption: "CHARGEABLE",
                travelEndDateTimeTimeZoneId: "Europe/Berlin",
                inactive: false,
                travelStartDateTime: formatDateTime(startDate),
                travelStartDateTimeTimeZoneId: "Europe/Berlin",
                createPerson: this._buildCreatePerson(oEntry.technicianId, oEntry.technicianExternalId),
                driver: false,
                privateCar: false,
                udfValues: [{
                    meta: {
                        externalId: "Z_Mileage_MatID"
                    },
                    value: itemExternalId || ""
                },
                {
                    meta: {
                        externalId: "Z_Mileage_Type"
                    },
                    value: itemExternalId || ""
                }],
                remarks: oEntry.remarks || "",
                syncStatus: "REQUIRES_APPROVAL",
                object: {
                    objectId: activityId || "",
                    objectType: "ACTIVITY"
                }
            };
        },

        /**
         * Build Time & Material API payload.
         * Returns combined structure for multiple API calls (1 Material + dynamic Time Efforts).
         * Times are calculated sequentially from Activity Planned Start.
         * chargeOption is always "CHARGEABLE".
         * @param {Object} oEntry - Time & Material entry data
         * @param {string} activityId - Activity ID
         * @param {string} orgLevelId - Organization Level ID
         * @returns {Object} Combined T&M payload structure
         */
        buildTimeAndMaterialPayload(oEntry, activityId, orgLevelId) {
            // Use itemExternalId directly from entry
            const itemExternalId = oEntry.itemExternalId || "";

            const technicianExternalId = oEntry.technicianExternalId || "";

            const objectRef = {
                objectId: activityId || "",
                objectType: "ACTIVITY"
            };

            const timeEffortConstants = {
                inactive: false,
                startDateTimeTimeZoneId: "Europe/Berlin",
                endDateTimeTimeZoneId: "Europe/Berlin",
                breakInMinutes: 0,
                unitPrice: null,
                timeZoneId: "UTC+02:00",
                internalRemarks: null,
                breakStartDateTime: null,
                udfValues: [{
                    meta: {
                        externalId: "Z_TimeEffort_MatID"
                    },
                    value: "Z13000000"
                }],
                syncStatus: "REQUIRES_APPROVAL"
            };

            // Get activity planned start date for time portion
            const activityPlannedStart = TMCreationService.getActivityPlannedStartDate();
            const baseStartDateTime = activityPlannedStart || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
            
            // Extract time portion from planned start (HH:mm:ss)
            const baseTimePortion = baseStartDateTime.split('T')[1] || '12:00:00Z';

            // Use entry's materialDate or fallback to planned start date
            const materialDate = oEntry.materialDate || baseStartDateTime.split('T')[0];

            // Format dates as ISO strings without milliseconds
            const formatDateTime = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

            // Collect all time entries with their type for sorting
            // Type order: AZ (1) -> FZ (2) -> WZ (3)
            // Helper to expand entries with multiple technicians
            const expandMultiTechnicianEntries = (entries, typeOrder, typeCode) => {
                const expanded = [];
                (entries || []).forEach(entry => {
                    if (entry && entry.taskCode) {
                        // Check if entry has multiple technicians
                        const selectedTechnicians = entry.selectedTechnicians || [];
                        
                        if (selectedTechnicians.length > 0) {
                            // Create one entry per technician
                            selectedTechnicians.forEach(tech => {
                                expanded.push({ 
                                    ...entry, 
                                    typeOrder, 
                                    typeCode,
                                    // Override technician with this specific one
                                    technicianExternalId: tech.externalId,
                                    technicianId: tech.id,
                                    technicianDisplay: tech.displayText
                                });
                            });
                        } else if (entry.technicianExternalId) {
                            // Legacy single technician
                            expanded.push({ ...entry, typeOrder, typeCode });
                        }
                    }
                });
                return expanded;
            };

            // Collect all time entries with their type for sorting
            // Type order: AZ (1) -> FZ (2) -> WZ (3)
            // Expand multi-technician entries into separate entries
            const allTimeEntries = [
                ...expandMultiTechnicianEntries(oEntry.timeEffortsAZ, 1, 'AZ'),
                ...expandMultiTechnicianEntries(oEntry.timeEffortsFZ, 2, 'FZ'),
                ...expandMultiTechnicianEntries(oEntry.timeEffortsWZ, 3, 'WZ')
            ];

            // Sort entries: first by date, then by type order (AZ -> FZ -> WZ)
            allTimeEntries.sort((a, b) => {
                const dateA = this._normalizeDate(a.entryDate) || baseStartDateTime.split('T')[0];
                const dateB = this._normalizeDate(b.entryDate) || baseStartDateTime.split('T')[0];
                
                if (dateA !== dateB) {
                    return dateA.localeCompare(dateB);
                }
                return a.typeOrder - b.typeOrder;
            });

            // Track end times per date for sequential chaining
            const endTimesByDate = {};

            // Build payload for each entry with sequential times per date
            const buildTimeEffortPayload = (entry) => {
                const entryDateStr = this._normalizeDate(entry.entryDate) || baseStartDateTime.split('T')[0];
                
                // Get start time: either from previous entry's end time (same date) or base time
                let startTime;
                if (endTimesByDate[entryDateStr]) {
                    startTime = new Date(endTimesByDate[entryDateStr]);
                } else {
                    startTime = new Date(`${entryDateStr}T${baseTimePortion}`);
                }
                
                const durationMinutes = parseInt(entry.duration) || 0;
                const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
                
                // Store end time for next entry on same date
                endTimesByDate[entryDateStr] = endTime.toISOString();
                
                // Get task UUID from code
                const taskId = TimeTaskService.getTaskIdByCode(entry.taskCode);
                
                // Use individual time entry's technician, fallback to parent entry's technician
                const entryTechnicianExternalId = entry.technicianExternalId || technicianExternalId;
                const entryTechnicianId = entry.technicianId || oEntry.technicianId || "";
                
                return {
                    chargeOption: "CHARGEABLE",
                    ...timeEffortConstants,
                    orgLevel: orgLevelId || "",
                    task: taskId,
                    startDateTime: formatDateTime(startTime),
                    endDateTime: formatDateTime(endTime),
                    remarks: entry.remarks || "",
                    createPerson: this._buildCreatePerson(entryTechnicianId, entryTechnicianExternalId),
                    object: objectRef
                };
            };

            // Build payloads in sorted order (sequential times per date)
            const allPayloads = allTimeEntries.map(buildTimeEffortPayload);

            // Separate back into type arrays for API calls
            const timeEffortsAZ = [];
            const timeEffortsFZ = [];
            const timeEffortsWZ = [];
            
            allTimeEntries.forEach((entry, index) => {
                const payload = allPayloads[index];
                if (entry.typeCode === 'AZ') {
                    timeEffortsAZ.push(payload);
                } else if (entry.typeCode === 'FZ') {
                    timeEffortsFZ.push(payload);
                } else if (entry.typeCode === 'WZ') {
                    timeEffortsWZ.push(payload);
                }
            });

            return {
                note: "Time & Material creates multiple API calls",
                material: {
                    chargeOption: "CHARGEABLE",
                    inactive: false,
                    orgLevel: orgLevelId || "",
                    item: itemExternalId ? { externalId: itemExternalId } : null,
                    quantity: parseFloat(oEntry.quantity) || 0,
                    createPerson: this._buildCreatePerson(oEntry.technicianId, technicianExternalId),
                    date: materialDate,
                    remarks: oEntry.remarksMaterial || "",
                    syncStatus: "REQUIRES_APPROVAL",
                    object: objectRef
                },
                timeEffortsFZ: timeEffortsFZ,
                timeEffortsWZ: timeEffortsWZ,
                timeEffortsAZ: timeEffortsAZ
            };
        },

        /**
         * Format payload as JSON string for display.
         * @param {Object} payload - Payload object
         * @returns {string} Formatted JSON string
         */
        formatPayloadJSON(payload) {
            return JSON.stringify(payload, null, 2);
        }
    };
});