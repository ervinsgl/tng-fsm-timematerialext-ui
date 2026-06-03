/**
 * UdfMetaService.js
 * 
 * Frontend service for UDF (User-Defined Field) metadata resolution.
 * Handles fetching and caching of UDF meta externalIds for display formatting.
 * 
 * Key Features:
 * - Fetch UDF meta externalId by ID
 * - Batch fetch with chunking for performance
 * - Cache results to avoid redundant API calls
 * - Format UDF values for display
 * - Pre-load UDF meta for report arrays
 * 
 * Display Format: "Z_Activity_ProductId: Z10000001"
 * 
 * API Endpoint Used:
 * - POST /api/get-udf-meta
 * 
 * @file UdfMetaService.js
 * @module com/tns/fsm/timematerialext/app/utils/services/UdfMetaService
 */
sap.ui.define([], () => {
    "use strict";

    /**
     * Cache for UDF meta - maps ID to externalId.
     * @type {Map<string, string|null>}
     * @private
     */
    let _udfMetaCache = new Map();

    return {
        /**
         * Fetch UDF Meta externalId by ID from backend.
         * Results are cached for the session.
         * @param {string} udfMetaId - UDF Meta ID
         * @returns {Promise<string|null>} externalId or null if not found
         */
        async fetchUdfMetaById(udfMetaId) {
            if (!udfMetaId) {
                return null;
            }

            if (_udfMetaCache.has(udfMetaId)) {
                return _udfMetaCache.get(udfMetaId);
            }

            try {
                const response = await fetch("/api/v1/get-udf-meta", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ udfMetaId: udfMetaId })
                });

                if (!response.ok) {
                    _udfMetaCache.set(udfMetaId, null);
                    return null;
                }

                const data = await response.json();
                const externalId = data.externalId || null;

                _udfMetaCache.set(udfMetaId, externalId);
                return externalId;

            } catch (error) {
                console.error("UdfMetaService: Error fetching UDF Meta:", error);
                _udfMetaCache.set(udfMetaId, null);
                return null;
            }
        },

        /**
         * Batch fetch multiple UDF Meta externalIds.
         * Processes in chunks to avoid overwhelming the API.
         * @param {Array<string>} udfMetaIds - Array of UDF Meta IDs
         * @returns {Promise<Map<string, string|null>>} Map of ID to externalId
         */
        async fetchMultipleUdfMeta(udfMetaIds) {
            if (!udfMetaIds || udfMetaIds.length === 0) {
                return new Map();
            }

            const uncachedIds = udfMetaIds.filter(id => !_udfMetaCache.has(id));

            if (uncachedIds.length > 0) {
                const chunkSize = 10;
                for (let i = 0; i < uncachedIds.length; i += chunkSize) {
                    const chunk = uncachedIds.slice(i, i + chunkSize);
                    await Promise.all(chunk.map(id => this.fetchUdfMetaById(id)));
                }
            }

            const result = new Map();
            udfMetaIds.forEach(id => {
                if (_udfMetaCache.has(id)) {
                    result.set(id, _udfMetaCache.get(id));
                }
            });

            return result;
        },

        /**
         * Get cached externalId for a UDF Meta ID (synchronous).
         * @param {string} udfMetaId - UDF Meta ID
         * @returns {string|null} externalId or null if not cached/found
         */
        getExternalIdById(udfMetaId) {
            if (!udfMetaId) {
                return null;
            }
            return _udfMetaCache.get(udfMetaId) || null;
        },

        /**
         * Format UDF values array for display.
         * Filters out UDFs without externalId.
         * @param {Array<{meta: string, value: *}>} udfValues - Array of UDF value objects
         * @returns {string} Formatted string (e.g., "Field1: Value1, Field2: Value2") or 'N/A'
         */
        formatUdfValuesForDisplay(udfValues) {
            if (!udfValues || !Array.isArray(udfValues) || udfValues.length === 0) {
                return 'N/A';
            }

            const formattedParts = [];

            udfValues.forEach(udf => {
                const metaId = udf.meta;
                const value = udf.value;

                if (metaId && value !== undefined && value !== null) {
                    const externalId = this.getExternalIdById(metaId);
                    
                    if (externalId) {
                        formattedParts.push(`${externalId}: ${value}`);
                    }
                }
            });

            return formattedParts.length > 0 ? formattedParts.join(', ') : 'N/A';
        },

        /**
         * Pre-load UDF Meta for an array of reports.
         * Call this before formatting to ensure cache is populated.
         * @param {Array} reports - Array of T&M report objects
         * @returns {Promise<void>}
         */
        async preloadUdfMetaForReports(reports) {
            if (!reports || reports.length === 0) {
                return;
            }

            const allMetaIds = new Set();

            reports.forEach(report => {
                const udfValues = report.udfValues || report.fullData?.udfValues || [];
                udfValues.forEach(udf => {
                    if (udf.meta) {
                        // Handle both string ID and object with id/externalId
                        const metaId = typeof udf.meta === 'string' ? udf.meta : (udf.meta.id || udf.meta.externalId);
                        if (metaId && typeof metaId === 'string') {
                            allMetaIds.add(metaId);
                        }
                    }
                });
            });

            if (allMetaIds.size > 0) {
                await this.fetchMultipleUdfMeta(Array.from(allMetaIds));
            }
        },

        /**
         * Clear the cache.
         */
        clearCache() {
            _udfMetaCache.clear();
        }
    };
});