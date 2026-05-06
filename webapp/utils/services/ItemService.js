/**
 * ItemService.js
 * 
 * Frontend service for item/material data management.
 * Handles fetching, caching, and lookup of items for T&M entries.
 * 
 * Key Features:
 * - Fetch and cache all items from FSM (excluding tools and Z11% items)
 * - Dual lookup maps: by ID and by externalId
 * - Search and suggestion support for item selection
 * - Dropdown data transformation
 * 
 * Display Format: "Material Name"
 * 
 * API Endpoint Used:
 * - GET /api/get-items
 * 
 * @file ItemService.js
 * @module com/tng/fsm/timematerialext/app/utils/services/ItemService
 */
sap.ui.define([], () => {
    "use strict";

    /**
     * Cache for items array.
     * @type {Array|null}
     * @private
     */
    let _itemsCache = null;
    
    /**
     * Map for quick ID-to-object lookup.
     * @type {Map<string, Object>|null}
     * @private
     */
    let _itemsMapById = null;
    
    /**
     * Map for quick externalId-to-object lookup.
     * @type {Map<string, Object>|null}
     * @private
     */
    let _itemsMapByExternalId = null;

    return {
        /**
         * Fetch all items from backend (excluding tools and Z11% items).
         * Results are cached for the session.
         * @returns {Promise<Array>} Array of item objects
         */
        async fetchItems() {
            if (_itemsCache) {
                return _itemsCache;
            }

            try {
                const response = await fetch("/api/v1/get-items", {
                    method: "GET",
                    headers: { "Content-Type": "application/json" }
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch items: ${response.status}`);
                }

                const data = await response.json();
                _itemsCache = data.items || [];

                this._buildLookupMaps();

                return _itemsCache;

            } catch (error) {
                console.error("ItemService: Error fetching items:", error);
                throw error;
            }
        },

        /**
         * Build internal lookup maps for ID and externalId resolution.
         * @private
         */
        _buildLookupMaps() {
            _itemsMapById = new Map();
            _itemsMapByExternalId = new Map();
            
            if (_itemsCache) {
                _itemsCache.forEach(item => {
                    if (item.id) {
                        _itemsMapById.set(item.id, item);
                    }
                    if (item.externalId) {
                        _itemsMapByExternalId.set(item.externalId, item);
                    }
                });
            }
        },

        /**
         * Get item name by ID.
         * @param {string} itemId - Item ID
         * @returns {string} Item name or ID as fallback
         */
        getItemNameById(itemId) {
            if (!itemId || itemId === 'N/A') {
                return 'N/A';
            }

            if (!_itemsMapById) {
                return itemId;
            }

            const item = _itemsMapById.get(itemId);
            return item ? item.name : itemId;
        },

        /**
         * Get item name by external ID.
         * @param {string} externalId - Item external ID
         * @returns {string} Item name or externalId as fallback
         */
        getItemNameByExternalId(externalId) {
            if (!externalId || externalId === 'N/A') {
                return 'N/A';
            }

            if (!_itemsMapByExternalId) {
                return externalId;
            }

            const item = _itemsMapByExternalId.get(externalId);
            return item ? item.name : externalId;
        },

        /**
         * Get item display text by ID.
         * @param {string} itemId - Item ID
         * @returns {string} Item name or ID as fallback
         */
        getItemDisplayTextById(itemId) {
            if (!itemId || itemId === 'N/A') {
                return 'N/A';
            }

            if (!_itemsMapById) {
                return itemId;
            }

            const item = _itemsMapById.get(itemId);
            if (item) {
                return item.name;
            }
            return itemId;
        },

        /**
         * Get item display text by external ID.
         * @param {string} externalId - Item external ID
         * @returns {string} Item name or externalId as fallback
         */
        getItemDisplayTextByExternalId(externalId) {
            if (!externalId || externalId === 'N/A') {
                return 'N/A';
            }

            if (!_itemsMapByExternalId) {
                return externalId;
            }

            const item = _itemsMapByExternalId.get(externalId);
            if (item) {
                return item.name;
            }
            return externalId;
        },

        /**
         * Get full item object by ID.
         * @param {string} itemId - Item ID
         * @returns {Object|null} Item object or null
         */
        getItemById(itemId) {
            if (!itemId || !_itemsMapById) {
                return null;
            }
            return _itemsMapById.get(itemId) || null;
        },

        /**
         * Get all cached items.
         * @returns {Array} Array of item objects
         */
        getAllItems() {
            return _itemsCache || [];
        },

        /**
         * Transform items for dropdown/select control.
         * @returns {Array<{key: string, text: string, externalId: string, name: string}>}
         */
        getItemsForDropdown() {
            if (!_itemsCache) {
                return [];
            }

            return _itemsCache.map(item => ({
                key: item.id,
                text: item.name,
                externalId: item.externalId,
                name: item.name
            }));
        },

        /**
         * Get all items formatted for Input suggestions.
         * @returns {Array<{id: string, externalId: string, name: string, displayText: string}>}
         */
        getAllForSuggestions() {
            if (!_itemsCache) {
                return [];
            }

            return _itemsCache.map(item => ({
                id: item.id,
                externalId: item.externalId,
                name: item.name,
                displayText: item.name
            }));
        },

        /**
         * Get item suggestion object by externalId.
         * @param {string} externalId - Item external ID
         * @returns {Object|null} Item suggestion object or null
         */
        getItemSuggestionByExternalId(externalId) {
            if (!externalId || !_itemsMapByExternalId) {
                return null;
            }
            
            const item = _itemsMapByExternalId.get(externalId);
            if (item) {
                return {
                    id: item.id,
                    externalId: item.externalId,
                    name: item.name,
                    displayText: item.name
                };
            }
            return null;
        },

        /**
         * Clear the cache.
         */
        clearCache() {
            _itemsCache = null;
            _itemsMapById = null;
            _itemsMapByExternalId = null;
        }
    };
});