/**
 * ExpenseTypeService.js
 * 
 * Frontend service for expense type data management.
 * Handles fetching, caching, and lookup of expense types for T&M entries.
 * 
 * Key Features:
 * - Fetch and cache all expense types from FSM
 * - ID-to-name lookup for display
 * - Dropdown data transformation (sorted by code)
 * 
 * Display Format: "Travel Expenses"
 * 
 * API Endpoint Used:
 * - GET /api/get-expense-types
 * 
 * @file ExpenseTypeService.js
 * @module com/tng/fsm/timematerialext/app/utils/services/ExpenseTypeService
 */
sap.ui.define([], () => {
    "use strict";

    /**
     * Cache for expense types array.
     * @type {Array|null}
     * @private
     */
    let _expenseTypesCache = null;
    
    /**
     * Map for quick ID-to-object lookup.
     * @type {Map<string, Object>|null}
     * @private
     */
    let _expenseTypesMap = null;

    return {
        /**
         * Fetch all expense types from backend.
         * Results are cached for the session.
         * @returns {Promise<Array>} Array of expense type objects
         */
        async fetchExpenseTypes() {
            if (_expenseTypesCache) {
                return _expenseTypesCache;
            }

            try {
                const response = await fetch("/api/v1/get-expense-types", {
                    method: "GET",
                    headers: { "Content-Type": "application/json" }
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch expense types: ${response.status}`);
                }

                const data = await response.json();
                _expenseTypesCache = data.expenseTypes || [];

                this._buildLookupMap();

                return _expenseTypesCache;

            } catch (error) {
                console.error("ExpenseTypeService: Error fetching expense types:", error);
                throw error;
            }
        },

        /**
         * Build internal lookup map for ID-to-name resolution.
         * @private
         */
        _buildLookupMap() {
            _expenseTypesMap = new Map();
            
            if (_expenseTypesCache) {
                _expenseTypesCache.forEach(expenseType => {
                    _expenseTypesMap.set(expenseType.id, expenseType);
                });
            }
        },

        /**
         * Get expense type name by ID.
         * @param {string} expenseTypeId - Expense type ID
         * @returns {string} Expense type name or ID as fallback
         */
        getExpenseTypeNameById(expenseTypeId) {
            if (!expenseTypeId || expenseTypeId === 'N/A') {
                return 'N/A';
            }

            if (!_expenseTypesMap) {
                return expenseTypeId;
            }

            const expenseType = _expenseTypesMap.get(expenseTypeId);
            return expenseType ? expenseType.name : expenseTypeId;
        },

        /**
         * Get expense type display text by ID.
         * @param {string} expenseTypeId - Expense type ID
         * @returns {string} Expense type name or ID as fallback
         */
        getExpenseTypeDisplayTextById(expenseTypeId) {
            if (!expenseTypeId || expenseTypeId === 'N/A') {
                return 'N/A';
            }

            if (!_expenseTypesMap) {
                return expenseTypeId;
            }

            const expenseType = _expenseTypesMap.get(expenseTypeId);
            if (expenseType) {
                return expenseType.name;
            }
            return expenseTypeId;
        },

        /**
         * Get all cached expense types.
         * @returns {Array} Array of expense type objects
         */
        getAllExpenseTypes() {
            return _expenseTypesCache || [];
        },

        /**
         * Transform expense types for dropdown/select control.
         * Sorted by name to ensure consistent order.
         * @returns {Array<{key: string, text: string, code: string, name: string}>}
         */
        getExpenseTypesForDropdown() {
            if (!_expenseTypesCache) {
                return [];
            }

            const items = _expenseTypesCache.map(expenseType => ({
                key: expenseType.id,
                text: expenseType.name,
                code: expenseType.code,
                name: expenseType.name
            }));

            items.sort((a, b) => a.name.localeCompare(b.name));
            
            return items;
        },

        /**
         * Check if expense types are loaded.
         * @returns {boolean} True if cache is populated
         */
        isLoaded() {
            return _expenseTypesCache !== null;
        },

        /**
         * Clear the cache.
         */
        clearCache() {
            _expenseTypesCache = null;
            _expenseTypesMap = null;
        }
    };
});