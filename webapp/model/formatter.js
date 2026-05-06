/**
 * formatter.js
 * 
 * UI formatting utilities for data binding in XML views.
 * Provides consistent formatting for dates, numbers, and IDs.
 * 
 * Key Features:
 * - DateTime and Date formatting for display
 * - Numeric value formatting (quantity, amount, distance)
 * - Activity ID formatting for FSM API
 * - JSON formatting for debugging
 * - Service Product type checking (Expense, Mileage, Time & Material)
 * 
 * Usage in XML Views:
 *   text="{path: 'view>startDateTime', formatter: '.formatter.formatDateTime'}"
 * 
 * @file formatter.js
 * @module com/tng/fsm/timematerialext/app/model/formatter
 */
sap.ui.define([
    "com/tng/fsm/timematerialext/app/utils/services/TypeConfigService"
], (TypeConfigService) => {
    "use strict";

    return {
        /**
         * Format JSON object for display (debugging).
         * @param {Object} data - Data to format
         * @returns {string} Formatted JSON string with indentation
         */
        formatJSON(data) {
            if (!data) return "";
            return JSON.stringify(data, null, 2);
        },

        /**
         * Format ISO datetime string for display.
         * Uses browser's locale for formatting.
         * @param {string} dateTime - ISO datetime string (e.g., "2025-11-28T12:30:00Z")
         * @returns {string} Localized datetime string
         */
        formatDateTime(dateTime) {
            if (!dateTime) return "";
            try {
                return new Date(dateTime).toLocaleString();
            } catch (e) {
                return dateTime;
            }
        },

        /**
         * Format ISO date string for display.
         * Uses browser's locale for formatting.
         * @param {string} date - ISO date string (e.g., "2025-11-28")
         * @returns {string} Localized date string
         */
        formatDate(date) {
            if (!date) return "";
            try {
                return new Date(date).toLocaleDateString();
            } catch (e) {
                return date;
            }
        },

        /**
         * Format ISO datetime string for compact table display.
         * Returns short date format: "28.11" (DD.MM)
         * @param {string} dateTime - ISO datetime string
         * @returns {string} Short date string
         */
        formatDateShort(dateTime) {
            if (!dateTime) return "";
            try {
                const date = new Date(dateTime);
                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                return `${day}.${month}`;
            } catch (e) {
                return dateTime;
            }
        },

        /**
         * Format expense external amount from object.
         * @param {Object} amountObj - Amount object {amount, currency}
         * @returns {number} Amount value or 0
         */
        formatExpenseAmount(amountObj) {
            if (!amountObj || typeof amountObj !== 'object') return 0;
            return amountObj.amount || 0;
        },

        /**
         * Format mileage duration (handles 'N/A' string).
         * @param {number|string} duration - Duration in minutes or 'N/A'
         * @returns {number} Duration value or 0
         */
        formatMileageDuration(duration) {
            if (duration === 'N/A' || duration === null || duration === undefined) return 0;
            return parseInt(duration, 10) || 0;
        },

        /**
         * Format quantity value (removes trailing zeros).
         * @param {string|number} quantity - Quantity value
         * @returns {number} Parsed float value or 0
         */
        formatQuantity(quantity) {
            if (!quantity) return 0;
            return parseFloat(quantity);
        },

        /**
         * Format amount value (removes trailing zeros).
         * @param {string|number} amount - Amount value
         * @returns {number} Parsed float value or 0
         */
        formatAmount(amount) {
            if (!amount) return 0;
            return parseFloat(amount);
        },

        /**
         * Format distance value (removes trailing zeros).
         * @param {string|number} distance - Distance value
         * @returns {number} Parsed float value or 0
         */
        formatDistance(distance) {
            if (!distance) return 0;
            return parseFloat(distance);
        },

        /**
         * Format activity ID for FSM API.
         * Converts UUID format to FSM's uppercase format.
         * @param {string} activityId - UUID format (e.g., "77f485d3-c917-49db-8da3-c4045d95c2b9")
         * @returns {string} FSM format (e.g., "77F485D3C91749DB8DA3C4045D95C2B9")
         */
        formatActivityIdForFSM(activityId) {
            if (!activityId) return "";
            return activityId.replace(/-/g, '').toUpperCase();
        },

        /* =========================================================================
         * SERVICE PRODUCT TYPE FORMATTERS
         * ========================================================================= */

        /**
         * Check if Service Product ID is an Expense type.
         * @param {string} serviceProductId - Service Product external ID
         * @returns {boolean} True if expense type
         */
        isExpenseType(serviceProductId) {
            return TypeConfigService.isExpenseType(serviceProductId);
        },

        /**
         * Check if Service Product ID is a Mileage type.
         * @param {string} serviceProductId - Service Product external ID
         * @returns {boolean} True if mileage type
         */
        isMileageType(serviceProductId) {
            return TypeConfigService.isMileageType(serviceProductId);
        },

        /**
         * Check if Service Product ID is a Time & Material type.
         * @param {string} serviceProductId - Service Product external ID
         * @returns {boolean} True if time & material type
         */
        isTimeMaterialType(serviceProductId) {
            return TypeConfigService.isTimeMaterialType(serviceProductId);
        },

        /**
         * Get resource bundle for i18n (standalone helper).
         * @private
         * @returns {sap.base.i18n.ResourceBundle|null}
         */
        _getResourceBundle: function() {
            try {
                const oComponent = sap.ui.getCore().getComponent("container-com.tng.fsm.timematerialext.app");
                if (oComponent) {
                    return oComponent.getModel("i18n").getResourceBundle();
                }
            } catch (e) {
                // Silently fail - will use fallback values
            }
            return null;
        },

        /**
         * Format hours unit based on entry type.
         * @param {string} type - Entry type (Time Effort, Material, etc.)
         * @returns {string} Hours unit label or empty string
         */
        formatHoursUnit: function(type) {
            if (type === 'Time Effort') {
                try {
                    const oComponent = sap.ui.getCore().getComponent("container-com.tng.fsm.timematerialext.app");
                    if (oComponent) {
                        const oBundle = oComponent.getModel("i18n").getResourceBundle();
                        return oBundle.getText("unitHours");
                    }
                } catch (e) { /* fallback */ }
                return "hrs";
            }
            return "";
        },

        /**
         * Format pieces unit based on entry type.
         * @param {string} type - Entry type (Time Effort, Material, etc.)
         * @returns {string} Pieces unit label or empty string
         */
        formatPiecesUnit: function(type) {
            if (type === 'Material') {
                try {
                    const oComponent = sap.ui.getCore().getComponent("container-com.tng.fsm.timematerialext.app");
                    if (oComponent) {
                        const oBundle = oComponent.getModel("i18n").getResourceBundle();
                        return oBundle.getText("unitPieces");
                    }
                } catch (e) { /* fallback */ }
                return "pcs";
            }
            return "";
        },

        /**
         * Format remaining material quantity text.
         * @param {number} qty - Remaining quantity
         * @returns {string} Formatted text "of X pcs"
         */
        formatRemainingQty: function(qty) {
            try {
                const oComponent = sap.ui.getCore().getComponent("container-com.tng.fsm.timematerialext.app");
                if (oComponent) {
                    const oBundle = oComponent.getModel("i18n").getResourceBundle();
                    return oBundle.getText("remainingMaterialQty", [qty || 0]);
                }
            } catch (e) { /* fallback */ }
            return `of ${qty || 0} pcs`;
        },

        /**
         * Returns today at end of day as a Date object — used as maxDate on inline edit DatePickers.
         * Bound via formatter so it reacts to model changes but always returns today.
         * @returns {Date} Today at 23:59:59
         */
        formatTodayMaxDate: function() {
            const d = new Date();
            d.setHours(23, 59, 59, 999);
            return d;
        }
    };
});