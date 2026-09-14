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
 * ONE ENTRY PER HUMAN, FINDABLE UNDER ANY IDENTITY
 *   FSM stores one Person row per type for the same human (ERPUSER + EMPLOYEE),
 *   each with its own id and its own externalId. The backend merges them so the
 *   picker lists a technician once instead of twice - listing both would let a
 *   user create entries under an identity FSM's own apps never use.
 *
 *   The merged entry keeps every identity in `ids` / `externalIds`, and the
 *   lookups below match against those, not just the surviving row's own values.
 *   That matters: an activity's `responsible` / `supportingPersons` may name
 *   the collapsed identity, and without alias matching those technicians would
 *   silently disappear from the creation dialog.
 *
 * Optimization Strategy:
 * - Builds flat array from PersonService cache for faster iteration
 * - Pre-computes lowercase search text during build
 * - Early termination when max results reached
 *
 * @file TechnicianService.js
 * @module com/tns/fsm/timematerialext/app/utils/services/TechnicianService
 * @requires com/tns/fsm/timematerialext/app/utils/services/PersonService
 */
sap.ui.define([
    "com/tns/fsm/timematerialext/app/utils/services/PersonService"
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
         *
         * PersonService caches one object under several keys (every id and every
         * externalId of that human), so the `key === person.id` guard is what
         * keeps each person to a single entry here.
         * @private
         */
        _buildPersonsArray() {
            this._personsArray = [];
            const seenIds = new Set();

            PersonService._personCache.forEach((person, key) => {
                // Only add each person once (the canonical key, not an alias)
                if (key === person.id && !seenIds.has(person.id)) {
                    seenIds.add(person.id);

                    const ids = Array.isArray(person.ids) && person.ids.length > 0
                        ? person.ids
                        : [person.id].filter(Boolean);
                    const externalIds = Array.isArray(person.externalIds) && person.externalIds.length > 0
                        ? person.externalIds
                        : [person.externalId].filter(Boolean);

                    // Pre-compute search text for faster filtering.
                    // Every externalId is searchable, so typing the externalId of
                    // the collapsed identity still finds the person.
                    const searchText = [
                        person.firstName || '',
                        person.lastName || '',
                        externalIds.join(' '),
                        person.fullName || ''
                    ].join(' ').toLowerCase();

                    this._personsArray.push({
                        id: person.id,
                        externalId: person.externalId,
                        // Other identities of the same human - lookup only.
                        ids: ids,
                        externalIds: externalIds,
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
         *
         * Matches the person's own id AND the ids of the Person rows merged into
         * it, so an activity referencing the EMPLOYEE id still resolves.
         * @param {string} technicianId - Person ID
         * @returns {Object|null} Technician object or null
         */
        getTechnicianById(technicianId) {
            if (!technicianId || !this._isLoaded) return null;
            return this._personsArray.find(p =>
                p.id === technicianId
                || (Array.isArray(p.ids) && p.ids.indexOf(technicianId) !== -1)
            ) || null;
        },

        /**
         * Get technician by externalId.
         *
         * Matches every externalId of the same human - see getTechnicianById.
         * @param {string} externalId - Person external ID
         * @returns {Object|null} Technician object or null
         */
        getTechnicianByExternalId(externalId) {
            if (!externalId || !this._isLoaded) return null;
            return this._personsArray.find(p =>
                p.externalId === externalId
                || (Array.isArray(p.externalIds) && p.externalIds.indexOf(externalId) !== -1)
            ) || null;
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