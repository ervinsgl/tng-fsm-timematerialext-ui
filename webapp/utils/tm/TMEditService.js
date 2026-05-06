/**
 * TMEditService.js
 * 
 * Frontend service for T&M entry edit mode logic.
 * Handles initialization, extraction, and update of editable fields.
 * 
 * Key Features:
 * - Initialize edit field values from existing report data
 * - Extract edited values from model for API submission
 * - Build update payloads for PATCH API calls
 * - Generate display value updates after save
 * - Handle duration/datetime calculations during edit
 * 
 * Supported Entry Types:
 * - Time Effort: Duration, remarks, start/end datetime
 * - Material: Date, quantity, remarks
 * - Expense: Date, external/internal amounts, remarks
 * - Mileage: Date, distance, source, destination, travel duration, remarks
 * 
 * @file TMEditService.js
 * @module com/tng/fsm/timematerialext/app/utils/tm/TMEditService
 * @requires com/tng/fsm/timematerialext/app/utils/helpers/DateTimeService
 */
sap.ui.define([
    "com/tng/fsm/timematerialext/app/utils/helpers/DateTimeService"
], (DateTimeService) => {
    "use strict";

    return {
        /**
         * Initialize edit mode fields for a report.
         * Copies current values to edit fields.
         * @param {string} type - Report type (Time Effort, Material, Expense, Mileage)
         * @param {Object} report - Report data object
         * @returns {Object} Edit field values to set on model
         */
        initEditMode(type, report) {
            const cleanRemarks = (val) => (val === "N/A" || !val) ? "" : val;
            const cleanText = (val) => (val === "N/A" || !val) ? "" : val;

            switch (type) {
                case "Time Effort":
                    return {
                        editDurationMinutes: report.durationMinutes || 0,
                        editRemarks: cleanRemarks(report.remarksText),
                        editStartDateTime: report.startDateTime || "",
                        editEndDateTime: report.endDateTime || ""
                    };

                case "Material":
                    return {
                        editDate: report.fullData?.date || "",
                        editQuantity: report.fullData?.quantity || 0,
                        editRemarks: cleanRemarks(report.remarksText)
                    };

                case "Expense":
                    return {
                        editDate: report.fullData?.date || "",
                        editExternalAmount: report.fullData?.externalAmount?.amount || 0,
                        editInternalAmount: report.fullData?.internalAmount?.amount || 0,
                        editRemarks: cleanRemarks(report.remarksText)
                    };

                case "Mileage":
                    return {
                        editDate: report.fullData?.date || "",
                        editDistance: report.fullData?.distance || 0,
                        editSource: cleanText(report.source),
                        editDestination: cleanText(report.destination),
                        editTravelDurationMinutes: report.travelDurationMinutes || 0,
                        editTravelEnd: report.travelEndDateTime || "",
                        editRemarks: cleanRemarks(report.remarksText)
                    };

                default:
                    return {};
            }
        },

        /**
         * Get edited values from model.
         * @param {string} type - Report type
         * @param {sap.ui.model.json.JSONModel} model - Dialog model
         * @param {string} path - Path to report in model
         * @returns {Object} Edited values
         */
        getEditedValues(type, model, path) {
            const get = (prop) => model.getProperty(path + "/" + prop);

            switch (type) {
                case "Time Effort":
                    return {
                        durationMinutes: get("editDurationMinutes"),
                        remarks: get("editRemarks"),
                        startDateTime: get("startDateTime"),
                        endDateTime: get("editEndDateTime")
                    };

                case "Material":
                    return {
                        date: get("editDate"),
                        quantity: get("editQuantity"),
                        remarks: get("editRemarks")
                    };

                case "Expense":
                    return {
                        date: get("editDate"),
                        externalAmount: get("editExternalAmount"),
                        internalAmount: get("editInternalAmount"),
                        remarks: get("editRemarks")
                    };

                case "Mileage":
                    return {
                        date: get("editDate"),
                        distance: get("editDistance"),
                        source: get("editSource"),
                        destination: get("editDestination"),
                        travelDurationMinutes: get("editTravelDurationMinutes"),
                        travelStartDateTime: get("travelStartDateTime"),
                        travelEndDateTime: get("editTravelEnd"),
                        remarks: get("editRemarks")
                    };

                default:
                    return {};
            }
        },

        /**
         * Apply edit values to model.
         * @param {sap.ui.model.json.JSONModel} model - Dialog model
         * @param {string} path - Path to report in model
         * @param {Object} editValues - Values from initEditMode
         */
        applyEditValues(model, path, editValues) {
            Object.keys(editValues).forEach(key => {
                model.setProperty(path + "/" + key, editValues[key]);
            });
        },

        /**
         * Calculate end datetime based on start and duration.
         * @param {string} startDateTime - ISO datetime string
         * @param {number} durationMinutes - Duration in minutes
         * @returns {string} Calculated end datetime
         */
        calculateEndDateTime(startDateTime, durationMinutes) {
            return DateTimeService.calculateEndDateTime(startDateTime, durationMinutes);
        },

        /**
         * Handle duration change - recalculate end datetime.
         * @param {sap.ui.model.json.JSONModel} model - Dialog model
         * @param {string} path - Path to report in model
         * @param {string} type - Report type (Time Effort or Mileage)
         * @param {number} newDuration - New duration value
         */
        handleDurationChange(model, path, type, newDuration) {
            let startDateTime, endProperty;

            if (type === "Time Effort") {
                startDateTime = model.getProperty(path + "/startDateTime");
                endProperty = "/editEndDateTime";
            } else if (type === "Mileage") {
                startDateTime = model.getProperty(path + "/travelStartDateTime");
                endProperty = "/editTravelEnd";
                // Also update the duration minutes field
                model.setProperty(path + "/editTravelDurationMinutes", newDuration);
            } else {
                return;
            }

            if (startDateTime && newDuration >= 0) {
                const newEndDateTime = this.calculateEndDateTime(startDateTime, newDuration);
                model.setProperty(path + endProperty, newEndDateTime);
            }
        }
    };
});