/**
 * TechnicianService.js
 * 
 * Frontend service for technician selection in T&M entries.
 * Provides optimized search functionality for large person datasets (4000+).
 * 
 * Key Features:
 * - Lazy loading of all persons on first use
 * - Pre-computed search text for fast filtering
 * - Result limiting for UI performance (max 50 results)
 * - Integration with PersonService for data loading
 * 
 * Display Format: "John Doe"
 * 
 * Optimization Strategy:
 * - Builds flat array from PersonService cache for faster iteration
 * - Pre-computes lowercase search text during build
 * - Early termination when max results reached
 * 
 * @file TechnicianService.js
 * @module com/tng/fsm/timematerialext/app/utils/services/TechnicianService
 * @requires com/tng/fsm/timematerialext/app/utils/services/PersonService
 */
sap.ui.define([
    "com/tng/fsm/timematerialext/app/utils/services/PersonService"
], (PersonService) => {
    "use strict";

    return {
        /**
         * Flag to track if persons are loaded.
         * @type {boolean}
         * @private
         */
        _isLoaded: false,
        
        /**
         * Flag to prevent concurrent loading.
         * @type {boolean}
         * @private
         */
        _isLoading: false,
        
        /**
         * Promise for ongoing load operation.
         * @type {Promise|null}
         * @private
         */
        _loadPromise: null,

        /**
         * Cached persons array for quick filtering.
         * Stored separately for performance (avoids Map iteration).
         * @type {Array}
         * @private
         */
        _personsArray: [],

        /**
         * Initialize and load all persons.
         * Call once on app start or dialog open.
         * @returns {Promise<void>}
         */
        async initialize() {
            if (this._isLoaded) {
                return;
            }

            if (this._isLoading) {
                return this._loadPromise;
            }

            this._isLoading = true;
            this._loadPromise = this._loadPersons();
            
            try {
                await this._loadPromise;
                this._isLoaded = true;
            } finally {
                this._isLoading = false;
            }
        },

        /**
         * Load all persons and build optimized array.
         * @returns {Promise<void>}
         * @private
         */
        async _loadPersons() {
            try {
                await PersonService.loadAllPersons();
                this._buildPersonsArray();
            } catch (error) {
                console.error('TechnicianService: Failed to load persons:', error);
                throw error;
            }
        },

        /**
         * Build optimized array from PersonService cache.
         * Pre-computes search text for faster filtering.
         * @private
         */
        _buildPersonsArray() {
            this._personsArray = [];
            const seenIds = new Set();

            PersonService._personCache.forEach((person, key) => {
                // Only add each person once (by ID, not externalId duplicate)
                if (key === person.id && !seenIds.has(person.id)) {
                    seenIds.add(person.id);
                    
                    // Pre-compute search text for faster filtering
                    const searchText = [
                        person.firstName || '',
                        person.lastName || '',
                        person.externalId || '',
                        person.fullName || ''
                    ].join(' ').toLowerCase();

                    this._personsArray.push({
                        id: person.id,
                        externalId: person.externalId,
                        firstName: person.firstName,
                        lastName: person.lastName,
                        fullName: person.fullName,
                        displayText: person.fullName || `${person.firstName} ${person.lastName}`,
                        searchText: searchText
                    });
                }
            });

            // Sort by firstName for consistent display
            this._personsArray.sort((a, b) => {
                const nameA = (a.firstName || '').toLowerCase();
                const nameB = (b.firstName || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
        },

        /**
         * Search technicians with optimized filtering.
         * Returns max 50 results for performance.
         * @param {string} searchTerm - Search term (minimum 2 characters for filtering)
         * @returns {Array} Filtered array of technicians (max 50)
         */
        searchTechnicians(searchTerm) {
            if (!this._isLoaded) {
                return [];
            }

            if (!searchTerm || searchTerm.length < 2) {
                return this._personsArray.slice(0, 50);
            }

            const term = searchTerm.toLowerCase();
            const results = [];
            const maxResults = 50;

            // Optimized search - stop early when we have enough results
            for (let i = 0; i < this._personsArray.length && results.length < maxResults; i++) {
                const person = this._personsArray[i];
                if (person.searchText.includes(term)) {
                    results.push(person);
                }
            }

            return results;
        },

        /**
         * Get technician by ID.
         * @param {string} technicianId - Person ID
         * @returns {Object|null} Technician object or null
         */
        getTechnicianById(technicianId) {
            if (!technicianId || !this._isLoaded) return null;
            return this._personsArray.find(p => p.id === technicianId) || null;
        },

        /**
         * Get technician by externalId.
         * @param {string} externalId - Person external ID
         * @returns {Object|null} Technician object or null
         */
        getTechnicianByExternalId(externalId) {
            if (!externalId || !this._isLoaded) return null;
            return this._personsArray.find(p => p.externalId === externalId) || null;
        },

        /**
         * Get technician display text by ID.
         * @param {string} technicianId - Person ID
         * @returns {string} Display text or 'N/A'
         */
        getDisplayTextById(technicianId) {
            const technician = this.getTechnicianById(technicianId);
            return technician ? technician.displayText : 'N/A';
        },

        /**
         * Get default technician from activity responsible.
         * @param {string} responsibleExternalId - Activity responsible external ID
         * @returns {Object|null} Technician object or null
         */
        getDefaultTechnician(responsibleExternalId) {
            if (!responsibleExternalId || responsibleExternalId === 'N/A') {
                return null;
            }
            return this.getTechnicianByExternalId(responsibleExternalId);
        },

        /**
         * Check if service is ready.
         * @returns {boolean} True if loaded
         */
        isReady() {
            return this._isLoaded;
        },

        /**
         * Get all technicians for dropdown (limited to first 100).
         * @returns {Array} Array of technician objects
         */
        getAllForDropdown() {
            if (!this._isLoaded) return [];
            return this._personsArray.slice(0, 100);
        },

        /**
         * Clear cache and reset state.
         */
        clearCache() {
            this._isLoaded = false;
            this._isLoading = false;
            this._loadPromise = null;
            this._personsArray = [];
        }
    };
});