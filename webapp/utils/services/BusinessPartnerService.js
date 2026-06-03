/**
 * BusinessPartnerService.js
 * 
 * Frontend service for business partner data management.
 * Handles on-demand loading, caching, and lookup of business partners.
 * 
 * Key Features:
 * - On-demand loading of business partners by externalId
 * - Caching to avoid redundant API calls
 * - Prevention of duplicate concurrent requests
 * - Search and dropdown support for cached data
 * 
 * Display Format: "Company Name"
 * 
 * API Endpoint Used:
 * - POST /api/get-business-partner-by-external-id
 * 
 * @file BusinessPartnerService.js
 * @module com/tns/fsm/timematerialext/app/utils/services/BusinessPartnerService
 */
sap.ui.define([], () => {
    "use strict";

    return {
        /**
         * Cache for business partner data.
         * @type {Map<string, {externalId: string, name: string}>}
         * @private
         */
        _businessPartnerCache: new Map(),
        
        /**
         * Track ongoing loads to prevent duplicate requests.
         * @type {Map<string, Promise>}
         * @private
         */
        _loadingPromises: new Map(),

        /**
         * Get business partner display text by externalId.
         * Loads from API on-demand if not in cache.
         * @param {string} externalId - Business partner external ID
         * @returns {string} Company name or just externalId if not cached
         */
        getBusinessPartnerDisplayTextByExternalId(externalId) {
            if (!externalId || externalId === 'N/A') return 'N/A';

            const cached = this._businessPartnerCache.get(externalId);
            if (cached) {
                return cached.name;
            }

            // Not in cache - load asynchronously
            this._loadBusinessPartnerByExternalId(externalId);

            return externalId;
        },

        /**
         * Load business partner by externalId (async, caches result).
         * @param {string} externalId - Business partner external ID
         * @returns {Promise<void>}
         * @private
         */
        async _loadBusinessPartnerByExternalId(externalId) {
            if (!externalId) return;

            // Check if already loading
            if (this._loadingPromises.has(externalId)) {
                return this._loadingPromises.get(externalId);
            }

            const promise = (async () => {
                try {
                    const response = await fetch("/api/v1/get-business-partner-by-external-id", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ externalId })
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to load business partner: ${response.status}`);
                    }

                    const data = await response.json();
                    const businessPartner = data.businessPartner;

                    if (businessPartner) {
                        const bpData = {
                            externalId: businessPartner.externalId,
                            name: businessPartner.name || 'Unknown'
                        };
                        this._businessPartnerCache.set(businessPartner.externalId, bpData);
                    }

                } catch (error) {
                    console.error("BusinessPartnerService: Error loading business partner:", error);
                } finally {
                    this._loadingPromises.delete(externalId);
                }
            })();

            this._loadingPromises.set(externalId, promise);
            return promise;
        },

        /**
         * Preload specific business partners by externalId (for batch operations).
         * @param {string[]} externalIds - Array of external IDs to preload
         * @returns {Promise<void>}
         */
        async preloadBusinessPartnersByExternalId(externalIds) {
            if (!externalIds || externalIds.length === 0) return;

            const promises = externalIds
                .filter(id => id && id !== 'N/A' && !this._businessPartnerCache.has(id))
                .map(id => this._loadBusinessPartnerByExternalId(id));

            await Promise.allSettled(promises);
        },

        /**
         * Clear cache.
         */
        clearCache() {
            this._businessPartnerCache.clear();
            this._loadingPromises.clear();
        }
    };
});