/**
 * TypeConfigService.js
 * 
 * Frontend service for managing Service Product type configuration.
 * Fetches configuration from backend API (shared across all users).
 * 
 * Determines which Service Product IDs are treated as:
 * - Expense types
 * - Mileage types  
 * - Time & Material types (everything else)
 * 
 * Default Configuration:
 * - Expense: Z40000001, Z40000007, Z50000000
 * - Mileage: Z40000038, Z40000008
 * 
 * @file TypeConfigService.js
 * @module com/tng/fsm/timematerialext/app/utils/services/TypeConfigService
 */
sap.ui.define([], () => {
    "use strict";

    /**
     * Fallback default expense type IDs (used if API fails).
     * @type {string[]}
     */
    const DEFAULT_EXPENSE_TYPES = ["Z40000001", "Z40000007", "Z50000000"];

    /**
     * Fallback default mileage type IDs (used if API fails).
     * @type {string[]}
     */
    const DEFAULT_MILEAGE_TYPES = ["Z40000038", "Z40000008"];

    /**
     * Cached configuration from backend.
     * @type {{expenseTypes: string[], mileageTypes: string[]}|null}
     * @private
     */
    let _config = null;

    /**
     * Flag to track if config has been loaded from server.
     * @type {boolean}
     * @private
     */
    let _initialized = false;

    return {
        /**
         * Initialize configuration from backend API.
         * Should be called during app startup.
         * @returns {Promise<Object>} Configuration object
         */
        async init() {
            if (_initialized && _config) {
                return _config;
            }

            try {
                const response = await fetch("/api/v1/get-type-config");
                if (response.ok) {
                    const result = await response.json();
                    if (result.success && result.data) {
                        _config = {
                            expenseTypes: result.data.expenseTypes || DEFAULT_EXPENSE_TYPES,
                            mileageTypes: result.data.mileageTypes || DEFAULT_MILEAGE_TYPES
                        };
                        _initialized = true;
                        console.log("TypeConfigService: Loaded config from server", _config);
                        return _config;
                    }
                }
                throw new Error("Invalid response from server");
            } catch (error) {
                console.warn("TypeConfigService: Failed to load from server, using defaults", error);
                _config = {
                    expenseTypes: [...DEFAULT_EXPENSE_TYPES],
                    mileageTypes: [...DEFAULT_MILEAGE_TYPES]
                };
                _initialized = true;
                return _config;
            }
        },

        /**
         * Get current configuration (sync - uses cached values).
         * @returns {Object} Configuration with expenseTypes and mileageTypes arrays
         */
        getConfig() {
            if (!_config) {
                // Return defaults if not yet initialized
                return {
                    expenseTypes: [...DEFAULT_EXPENSE_TYPES],
                    mileageTypes: [...DEFAULT_MILEAGE_TYPES]
                };
            }
            return _config;
        },

        /**
         * Refresh configuration from backend.
         * @returns {Promise<Object>} Updated configuration
         */
        async refreshConfig() {
            _initialized = false;
            _config = null;
            return this.init();
        },

        /**
         * Get expense type IDs.
         * @returns {string[]} Array of expense type IDs
         */
        getExpenseTypes() {
            return this.getConfig().expenseTypes;
        },

        /**
         * Get mileage type IDs.
         * @returns {string[]} Array of mileage type IDs
         */
        getMileageTypes() {
            return this.getConfig().mileageTypes;
        },

        /**
         * Check if a Service Product ID is an expense type.
         * @param {string} serviceProductId - Service Product external ID
         * @returns {boolean} True if expense type
         */
        isExpenseType(serviceProductId) {
            if (!serviceProductId) return false;
            return this.getExpenseTypes().includes(serviceProductId);
        },

        /**
         * Check if a Service Product ID is a mileage type.
         * @param {string} serviceProductId - Service Product external ID
         * @returns {boolean} True if mileage type
         */
        isMileageType(serviceProductId) {
            if (!serviceProductId) return false;
            return this.getMileageTypes().includes(serviceProductId);
        },

        /**
         * Check if a Service Product ID is a time & material type.
         * (i.e., not expense and not mileage)
         * @param {string} serviceProductId - Service Product external ID
         * @returns {boolean} True if time & material type
         */
        isTimeMaterialType(serviceProductId) {
            if (!serviceProductId) return true;
            return !this.isExpenseType(serviceProductId) && !this.isMileageType(serviceProductId);
        },

        /**
         * Add an expense type ID (calls backend API).
         * @param {string} typeId - Service Product external ID to add
         * @param {string} [modifiedBy] - Username making the change
         * @returns {Promise<Object>} Result with success status
         */
        async addExpenseType(typeId, modifiedBy) {
            if (!typeId) {
                return { success: false, message: "Type ID is required" };
            }

            try {
                const response = await fetch("/api/v1/add-expense-type", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ typeId, modifiedBy })
                });
                
                const result = await response.json();
                
                if (result.success && result.data) {
                    _config = {
                        expenseTypes: result.data.expenseTypes,
                        mileageTypes: result.data.mileageTypes
                    };
                }
                
                return result;
            } catch (error) {
                console.error("TypeConfigService: Error adding expense type:", error);
                return { success: false, message: error.message };
            }
        },

        /**
         * Remove an expense type ID (calls backend API).
         * @param {string} typeId - Service Product external ID to remove
         * @param {string} [modifiedBy] - Username making the change
         * @returns {Promise<Object>} Result with success status
         */
        async removeExpenseType(typeId, modifiedBy) {
            if (!typeId) {
                return { success: false, message: "Type ID is required" };
            }

            try {
                const response = await fetch("/api/v1/remove-expense-type", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ typeId, modifiedBy })
                });
                
                const result = await response.json();
                
                if (result.success && result.data) {
                    _config = {
                        expenseTypes: result.data.expenseTypes,
                        mileageTypes: result.data.mileageTypes
                    };
                }
                
                return result;
            } catch (error) {
                console.error("TypeConfigService: Error removing expense type:", error);
                return { success: false, message: error.message };
            }
        },

        /**
         * Add a mileage type ID (calls backend API).
         * @param {string} typeId - Service Product external ID to add
         * @param {string} [modifiedBy] - Username making the change
         * @returns {Promise<Object>} Result with success status
         */
        async addMileageType(typeId, modifiedBy) {
            if (!typeId) {
                return { success: false, message: "Type ID is required" };
            }

            try {
                const response = await fetch("/api/v1/add-mileage-type", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ typeId, modifiedBy })
                });
                
                const result = await response.json();
                
                if (result.success && result.data) {
                    _config = {
                        expenseTypes: result.data.expenseTypes,
                        mileageTypes: result.data.mileageTypes
                    };
                }
                
                return result;
            } catch (error) {
                console.error("TypeConfigService: Error adding mileage type:", error);
                return { success: false, message: error.message };
            }
        },

        /**
         * Remove a mileage type ID (calls backend API).
         * @param {string} typeId - Service Product external ID to remove
         * @param {string} [modifiedBy] - Username making the change
         * @returns {Promise<Object>} Result with success status
         */
        async removeMileageType(typeId, modifiedBy) {
            if (!typeId) {
                return { success: false, message: "Type ID is required" };
            }

            try {
                const response = await fetch("/api/v1/remove-mileage-type", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ typeId, modifiedBy })
                });
                
                const result = await response.json();
                
                if (result.success && result.data) {
                    _config = {
                        expenseTypes: result.data.expenseTypes,
                        mileageTypes: result.data.mileageTypes
                    };
                }
                
                return result;
            } catch (error) {
                console.error("TypeConfigService: Error removing mileage type:", error);
                return { success: false, message: error.message };
            }
        },

        /**
         * Reset configuration to defaults (calls backend API).
         * @param {string} [modifiedBy] - Username making the change
         * @returns {Promise<Object>} Result with success status
         */
        async resetToDefaults(modifiedBy) {
            try {
                const response = await fetch("/api/v1/reset-type-config", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ modifiedBy })
                });
                
                const result = await response.json();
                
                if (result.success && result.data) {
                    _config = {
                        expenseTypes: result.data.expenseTypes,
                        mileageTypes: result.data.mileageTypes
                    };
                }
                
                return result;
            } catch (error) {
                console.error("TypeConfigService: Error resetting config:", error);
                return { success: false, message: error.message };
            }
        }
    };
});