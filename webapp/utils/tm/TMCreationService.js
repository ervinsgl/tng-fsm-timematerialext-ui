/**
 * TMCreationService.js
 * 
 * Frontend service for creating T&M (Time & Materials) entry templates.
 * Provides factory methods for each entry type with default values.
 * 
 * Key Features:
 * - Create entry templates for all T&M types
 * - Manage default technician, item, and expense type
 * - DateTime utilities delegated to DateTimeService
 * - Entry validation before save
 * 
 * Entry Types:
 * - Time Effort: Duration-based time entries
 * - Material: Parts/items with quantity
 * - Expense: Cost entries with amounts
 * - Mileage: Travel distance entries
 * - Time & Material: Combined entry (material + up to 3 time entries)
 * 
 * @file TMCreationService.js
 * @module com/tns/fsm/timematerialext/app/utils/tm/TMCreationService
 * @requires sap/m/MessageToast
 * @requires com/tns/fsm/timematerialext/app/utils/helpers/DateTimeService
 */
sap.ui.define([
    "sap/m/MessageToast",
    "com/tns/fsm/timematerialext/app/utils/helpers/DateTimeService"
], (MessageToast, DateTimeService) => {
    "use strict";

    return {
        /**
         * Get i18n text with optional parameters
         * @param {string} key - i18n key
         * @param {Array} [args] - Optional arguments for placeholders
         * @returns {string} Translated text
         * @private
         */
        _getText(key, args) {
            const oComponent = sap.ui.getCore().getComponent("container-com.tns.fsm.timematerialext.app");
            if (oComponent) {
                const oBundle = oComponent.getModel("i18n").getResourceBundle();
                return oBundle.getText(key, args);
            }
            return key; // Fallback to key if component not available
        },

        /**
         * Default technician data (set from activity responsible).
         * @type {Object|null}
         * @private
         */
        _defaultTechnician: null,

        /**
         * Default item data (set from activity service product).
         * @type {Object|null}
         * @private
         */
        _defaultItem: null,

        /**
         * Activity planned start date (ISO string).
         * @type {string|null}
         * @private
         */
        _activityPlannedStartDate: null,

        /**
         * Default quantity from activity.
         * @type {number|null}
         * @private
         */
        _defaultQuantity: null,

        /**
         * Default expense type data.
         * @type {Object|null}
         * @private
         */
        _defaultExpenseType: null,

        /**
         * Set activity planned start date.
         * @param {string} plannedStartDate - ISO datetime string from activity
         */
        setActivityPlannedStartDate(plannedStartDate) {
            this._activityPlannedStartDate = plannedStartDate;
        },

        /**
         * Get activity planned start date.
         * @returns {string|null} ISO datetime string or null
         */
        getActivityPlannedStartDate() {
            return this._activityPlannedStartDate;
        },

        /**
         * Set default quantity from activity.
         * @param {number} quantity - Quantity value from activity
         */
        setDefaultQuantity(quantity) {
            this._defaultQuantity = quantity;
        },

        /**
         * Get default quantity.
         * @returns {number|null} Quantity or null
         */
        getDefaultQuantity() {
            return this._defaultQuantity;
        },

        /**
         * Set default expense type.
         * @param {Object} expenseType - Expense type object {id, code, displayText}
         */
        setDefaultExpenseType(expenseType) {
            this._defaultExpenseType = expenseType;
        },

        /**
         * Get default expense type.
         * @returns {Object|null} Expense type object or null
         */
        getDefaultExpenseType() {
            return this._defaultExpenseType;
        },

        /**
         * Clear default expense type.
         */
        clearDefaultExpenseType() {
            this._defaultExpenseType = null;
        },

        /**
         * Get current datetime in ISO format.
         * @returns {string} ISO datetime string (e.g., "2025-11-28T12:30:00Z")
         */
        getNowDateTimeString() {
            return DateTimeService.getNowDateTimeString();
        },

        /**
         * Calculate end datetime from start and duration.
         * @param {string} startDateTime - ISO datetime string
         * @param {number} durationMinutes - Duration in minutes
         * @returns {string} ISO datetime string
         */
        calculateEndDateTime(startDateTime, durationMinutes) {
            return DateTimeService.calculateEndDateTime(startDateTime, durationMinutes);
        },

        /**
         * Set default technician from activity responsible.
         * @param {Object} technician - Technician object {id, externalId, displayText}
         */
        setDefaultTechnician(technician) {
            this._defaultTechnician = technician;
        },

        /**
         * Get default technician.
         * @returns {Object|null} Technician object or null
         */
        getDefaultTechnician() {
            return this._defaultTechnician;
        },

        /**
         * Clear default technician.
         */
        clearDefaultTechnician() {
            this._defaultTechnician = null;
        },

        /**
         * Set default item from activity service product.
         * @param {Object} item - Item object {id, displayText}
         */
        setDefaultItem(item) {
            this._defaultItem = item;
        },

        /**
         * Get default item.
         * @returns {Object|null} Item object or null
         */
        getDefaultItem() {
            return this._defaultItem;
        },

        /**
         * Clear default item.
         */
        clearDefaultItem() {
            this._defaultItem = null;
        },

        /**
         * Create Time Effort entry template.
         * Uses activity planned start date for startDateTime.
         * chargeOption is always set to "CHARGEABLE".
         * endDateTime is calculated from startDateTime + duration.
         * @returns {Object} Time Effort entry with default values
         */
        createTimeEffortEntry() {
            const defaultTech = this._defaultTechnician;
            const defaultDuration = 30;
            
            // Use activity planned start date, fallback to current time
            const startDateTime = this._activityPlannedStartDate || this.getNowDateTimeString();
            const endDateTime = this.calculateEndDateTime(startDateTime, defaultDuration);
            
            return {
                type: "Time Effort",
                icon: "sap-icon://time-entry-request",
                expanded: true,
                saveButtonText: "Save",
                saveButtonIcon: "sap-icon://save",
                saveButtonType: "Emphasized",
                saveButtonState: "unsaved",
                technicianId: defaultTech ? defaultTech.id : "",
                technicianExternalId: defaultTech ? defaultTech.externalId : "",
                technicianDisplay: defaultTech ? defaultTech.displayText : "",
                taskCode: "",
                taskDisplay: "",
                duration: defaultDuration,
                startDateTime: startDateTime,
                endDateTime: endDateTime,
                chargeOption: "CHARGEABLE",
                remarks: ""
            };
        },

        /**
         * Create Material entry template.
         * Item is from Activity Service Product (read-only).
         * Technician is from Activity Responsible.
         * Quantity is from Activity quantity.
         * Date is derived from Activity Planned Start at save time.
         * chargeOption is always "CHARGEABLE".
         * @returns {Object} Material entry with default values
         */
        createMaterialEntry() {
            const defaultTech = this._defaultTechnician;
            const defaultItem = this._defaultItem;
            const defaultQuantity = this._defaultQuantity;
            return {
                type: "Material",
                icon: "sap-icon://product",
                expanded: true,
                saveButtonText: "Save",
                saveButtonIcon: "sap-icon://save",
                saveButtonType: "Emphasized",
                saveButtonState: "unsaved",
                technicianId: defaultTech ? defaultTech.id : "",
                technicianExternalId: defaultTech ? defaultTech.externalId : "",
                technicianDisplay: defaultTech ? defaultTech.displayText : "",
                itemId: defaultItem ? defaultItem.id : "",
                itemExternalId: defaultItem ? defaultItem.externalId : "",
                itemDisplay: defaultItem ? defaultItem.displayText : "",
                quantity: defaultQuantity || "",
                chargeOption: "CHARGEABLE",
                remarks: ""
            };
        },

        /**
         * Create Expense entry template.
         * Type (Item) is from Activity Service Product (read-only).
         * Technician is from Activity Responsible.
         * Date is derived from Activity Planned Start at save time.
         * chargeOption is always "CHARGEABLE".
         * @returns {Object} Expense entry with default values
         */
        createExpenseEntry() {
            const defaultTech = this._defaultTechnician;
            const defaultExpenseType = this._defaultExpenseType;
            return {
                type: "Expense",
                icon: "sap-icon://money-bills",
                expanded: true,
                saveButtonText: "Create",
                saveButtonIcon: "sap-icon://create",
                saveButtonType: "Emphasized",
                saveButtonState: "unsaved",
                technicianId: defaultTech ? defaultTech.id : "",
                technicianExternalId: defaultTech ? defaultTech.externalId : "",
                technicianDisplay: defaultTech ? defaultTech.displayText : "",
                expenseTypeId: defaultExpenseType ? defaultExpenseType.id : "",
                expenseTypeCode: defaultExpenseType ? defaultExpenseType.code : "",
                expenseTypeDisplay: defaultExpenseType ? defaultExpenseType.displayText : "",
                externalAmountValue: 0,
                internalAmountValue: 0,
                chargeOption: "CHARGEABLE",
                entryDate: this._activityPlannedStartDate ? this._activityPlannedStartDate.split('T')[0] : "",
                remarks: ""
            };
        },

        /**
         * Create Mileage entry template.
         * Type (Item) is from Activity Service Product (read-only).
         * Technician is from Activity Responsible.
         * Distance is pre-populated from Activity Quantity.
         * Start/End times are derived from Activity Planned Start + Duration at save time.
         * Source/Destination default to blank.
         * Driver/Private Car default to false.
         * chargeOption is always "CHARGEABLE".
         * @returns {Object} Mileage entry with default values
         */
        createMileageEntry() {
            const defaultTech = this._defaultTechnician;
            const defaultItem = this._defaultItem;
            const defaultQuantity = this._defaultQuantity;
            return {
                type: "Mileage",
                icon: "sap-icon://car-rental",
                expanded: true,
                saveButtonText: "Create",
                saveButtonIcon: "sap-icon://create",
                saveButtonType: "Emphasized",
                saveButtonState: "unsaved",
                technicianId: defaultTech ? defaultTech.id : "",
                technicianExternalId: defaultTech ? defaultTech.externalId : "",
                technicianDisplay: defaultTech ? defaultTech.displayText : "",
                itemId: defaultItem ? defaultItem.id : "",
                itemExternalId: defaultItem ? defaultItem.externalId : "",
                itemDisplay: defaultItem ? defaultItem.displayText : "",
                distance: defaultQuantity || 0,
                travelDuration: 30,
                chargeOption: "CHARGEABLE",
                entryDate: this._activityPlannedStartDate ? this._activityPlannedStartDate.split('T')[0] : "",
                remarks: ""
            };
        },

        /**
         * Create Time & Material entry template (combined entry).
         * Includes material + dynamic time entries (Fahrzeit, Wartezeit, Arbeitszeit).
         * chargeOption is always "CHARGEABLE".
         * Start/End times are calculated sequentially at save time based on Activity Planned Start.
         * Material date is derived from Activity Planned Start date at save time.
         * Item is pre-populated from Activity Service Product (read-only).
         * Quantity is pre-populated from Activity quantity.
         * @returns {Object} Time & Material entry with default values
         */
        createTimeAndMaterialEntry() {
            const defaultTech = this._defaultTechnician;
            const defaultItem = this._defaultItem;
            const defaultQuantity = this._defaultQuantity;
            // Extract date from Activity Planned Start (YYYY-MM-DD format)
            const defaultDate = this._activityPlannedStartDate ? this._activityPlannedStartDate.split('T')[0] : "";
            return {
                type: "Time & Material",
                icon: "sap-icon://checklist-item-2",
                expanded: true,
                saveButtonText: "Create",
                saveButtonIcon: "sap-icon://create",
                saveButtonType: "Emphasized",
                saveButtonState: "unsaved",
                technicianId: defaultTech ? defaultTech.id : "",
                technicianExternalId: defaultTech ? defaultTech.externalId : "",
                technicianDisplay: defaultTech ? defaultTech.displayText : "",
                // Material fields (Item from Service Product - read-only, Quantity from Activity)
                itemId: defaultItem ? defaultItem.id : "",
                itemExternalId: defaultItem ? defaultItem.externalId : "",
                itemDisplay: defaultItem ? defaultItem.displayText : "",
                quantity: defaultQuantity || "",
                materialDate: defaultDate,  // Date for Material entry
                remarksMaterial: "",
                // Dynamic Time Effort arrays (FZ=Fahrzeit, WZ=Wartezeit, AZ=Arbeitszeit)
                timeEffortsFZ: [],
                timeEffortsWZ: [],
                timeEffortsAZ: [],
                // chargeOption always CHARGEABLE (used in payload)
                chargeOption: "CHARGEABLE"
            };
        },

        /**
         * Create a single Time Effort entry for Time & Material.
         * @param {string} type - Time type: 'FZ', 'WZ', or 'AZ'
         * @param {Object} defaultTechnician - Optional default technician from parent entry
         * @param {string} defaultDate - Optional default date (YYYY-MM-DD format)
         * @returns {Object} Time Effort entry
         */
        createTimeEffortForTM(type, defaultTechnician, defaultDate) {
            return {
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                type: type,
                // Technician fields - default from parent T&M entry
                technicianId: defaultTechnician?.id || "",
                technicianExternalId: defaultTechnician?.externalId || "",
                technicianDisplay: defaultTechnician?.displayText || "",
                technicianSuggestions: [], // Local suggestions for this entry
                // Task fields
                taskCode: "",
                taskDisplay: "",
                duration: 30,           // Backend value in minutes
                durationHours: 0.50,    // UI display in hours (30 min = 0.50 hrs)
                entryDate: defaultDate || "",  // Date for this entry (YYYY-MM-DD)
                remarks: ""
            };
        },

        /**
         * Add entry to model and show toast.
         * @param {sap.ui.model.json.JSONModel} oModel - Dialog model
         * @param {Object} entry - Entry object to add
         * @param {string} entryType - Type name for toast message
         */
        addEntryToModel(oModel, entry, entryType) {
            const aEntries = oModel.getProperty("/entries");
            aEntries.push(entry);
            oModel.setProperty("/entries", aEntries);
            MessageToast.show(this._getText("msgEntryAdded", [entryType]));
        },

        /**
         * Validate all entries before save.
         * @param {Array} entries - Array of entries to validate
         * @returns {{valid: boolean, errors: Array<string>}} Validation result
         */
        validateEntries(entries) {
            const errors = [];

            if (!entries || entries.length === 0) {
                errors.push("No entries to save");
                return { valid: false, errors };
            }

            entries.forEach((entry, index) => {
                switch (entry.type) {
                    case "Time Effort":
                        if (!entry.task) errors.push(`Entry ${index + 1}: Task is required`);
                        if (!entry.duration) errors.push(`Entry ${index + 1}: Duration is required`);
                        break;
                    case "Material":
                        if (!entry.item) errors.push(`Entry ${index + 1}: Item is required`);
                        if (!entry.quantity) errors.push(`Entry ${index + 1}: Quantity is required`);
                        break;
                    case "Expense":
                        if (!entry.itemDisplay) errors.push(`Entry ${index + 1}: Type is required`);
                        break;
                    case "Mileage":
                        if (!entry.distance) errors.push(`Entry ${index + 1}: Distance is required`);
                        break;
                    case "Time & Material":
                        if (!entry.itemDisplay) errors.push(`Entry ${index + 1}: Item is required`);
                        if (!entry.quantity) errors.push(`Entry ${index + 1}: Quantity is required`);
                        const totalTimeEfforts = (entry.timeEffortsFZ?.length || 0) + 
                                                 (entry.timeEffortsWZ?.length || 0) + 
                                                 (entry.timeEffortsAZ?.length || 0);
                        if (totalTimeEfforts === 0) {
                            errors.push(`Entry ${index + 1}: At least one Time Effort is required`);
                        }
                        break;
                }
            });

            return {
                valid: errors.length === 0,
                errors
            };
        },

        /**
         * Save all entries (placeholder for actual FSM API call).
         * @param {Array} entries - Array of entries to save
         * @param {string} activityId - Activity ID to save entries for
         * @returns {Promise<{success: boolean, savedCount: number}>} Save result
         */
        async saveAllEntries(entries, activityId) {
            const validation = this.validateEntries(entries);
            if (!validation.valid) {
                throw new Error(validation.errors.join("\n"));
            }

            // TODO: Implement actual FSM API calls
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve({
                        success: true,
                        savedCount: entries.length
                    });
                }, 500);
            });
        }
    };
});