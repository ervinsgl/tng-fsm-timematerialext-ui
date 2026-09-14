/**
 * PersonService.js
 *
 * Frontend service for person data management.
 * Handles on-demand loading, caching, and lookup of persons.
 *
 * Key Features:
 * - On-demand loading by ID or externalId
 * - Multi-key caching: by ID and by externalId for fast lookup
 * - Prevention of duplicate concurrent requests
 * - Batch preloading for optimized loading
 * - Full person list loading for search functionality
 *
 * Display Format: "John Doe"
 *
 * ONE HUMAN, SEVERAL IDENTITIES
 *   FSM stores one Person row per type for the same human - an ERPUSER row and
 *   an EMPLOYEE row - each with its OWN id and its OWN externalId (e.g.
 *   'egleizds1' and 'egleizds2'). /get-persons collapses them to one entry per
 *   human and returns the dropped identities in `ids` / `externalIds`.
 *
 *   This service caches that single entry under EVERY one of those keys, so a
 *   reference coming from anywhere in FSM - an activity's responsible, a
 *   supportingPersons id, a createPerson - resolves to the same person no
 *   matter which identity it names. The cache therefore holds several keys
 *   pointing at one shared object; that is intentional, not duplication.
 *
 * API Endpoints Used:
 * - POST /api/get-person-by-id
 * - POST /api/get-person-by-external-id
 * - POST /api/get-persons (loadAll: true)
 *
 * @file PersonService.js
 * @module com/tns/fsm/timematerialext/app/utils/services/PersonService
 */
sap.ui.define([], () => {
    "use strict";

    return {
        /**
         * Cache for person data (keyed by every ID and every externalId the
         * person has - several keys may share one value object).
         * @type {Map<string, {id: string, externalId: string, ids: string[], externalIds: string[], firstName: string, lastName: string, fullName: string}>}
         * @private
         */
        _personCache: new Map(),

        /**
         * Track ongoing loads to prevent duplicate requests.
         * @type {Map<string, Promise>}
         * @private
         */
        _loadingPromises: new Map(),

        /**
         * Get person display text by ID.
         * Loads from API on-demand if not in cache.
         * @param {string} personId - Person ID
         * @returns {string} Display text (full name only) or ID if not cached
         */
        getPersonDisplayTextById(personId) {
            if (!personId || personId === 'N/A') return 'N/A';

            const cached = this._personCache.get(personId);
            if (cached) {
                return cached.fullName;
            }

            this._loadPersonById(personId);
            return personId;
        },

        /**
         * Get person display text by externalId.
         * Loads from API on-demand if not in cache.
         * @param {string} externalId - Person external ID
         * @returns {string} Display text (full name only) or externalId if not cached
         */
        getPersonDisplayTextByExternalId(externalId) {
            if (!externalId || externalId === 'N/A') return 'N/A';

            const cached = this._personCache.get(externalId);
            if (cached) {
                return cached.fullName;
            }

            this._loadPersonByExternalId(externalId);
            return externalId;
        },

        /**
         * Build the cached shape from an API person and register it under every
         * key that person can be referenced by.
         *
         * `ids` / `externalIds` come from /get-persons, which merges the Person
         * rows of one human. The single-person endpoints return one row and so
         * have neither - the person's own id/externalId are then the only keys,
         * exactly as before.
         *
         * @param {Object} person - person object from the API
         * @returns {Object} the cached person data
         * @private
         */
        _cachePerson(person) {
            const personData = {
                id: person.id,
                externalId: person.externalId,
                // Every identity of this human; used for lookups, never shown.
                ids: Array.isArray(person.ids) && person.ids.length > 0
                    ? person.ids
                    : [person.id].filter(Boolean),
                externalIds: Array.isArray(person.externalIds) && person.externalIds.length > 0
                    ? person.externalIds
                    : [person.externalId].filter(Boolean),
                firstName: person.firstName,
                lastName: person.lastName,
                fullName: this._formatFullName(person.firstName, person.lastName)
            };

            personData.ids.forEach(id => {
                if (id) this._personCache.set(id, personData);
            });
            personData.externalIds.forEach(externalId => {
                if (externalId) this._personCache.set(externalId, personData);
            });

            return personData;
        },

        /**
         * Load person by ID (async, caches result).
         * @param {string} personId - Person ID
         * @returns {Promise<void>}
         * @private
         */
        async _loadPersonById(personId) {
            if (!personId) return;

            if (this._loadingPromises.has(personId)) {
                return this._loadingPromises.get(personId);
            }

            const promise = (async () => {
                try {
                    const response = await fetch("/api/v1/get-person-by-id", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ personId })
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to load person: ${response.status}`);
                    }

                    const data = await response.json();
                    const person = data.person;

                    if (person) {
                        this._cachePerson(person);
                    }

                } catch (error) {
                    console.error("PersonService: Error loading person by ID:", error);
                } finally {
                    this._loadingPromises.delete(personId);
                }
            })();

            this._loadingPromises.set(personId, promise);
            return promise;
        },

        /**
         * Load person by externalId (async, caches result).
         * @param {string} externalId - Person external ID
         * @returns {Promise<void>}
         * @private
         */
        async _loadPersonByExternalId(externalId) {
            if (!externalId) return;

            if (this._loadingPromises.has(externalId)) {
                return this._loadingPromises.get(externalId);
            }

            const promise = (async () => {
                try {
                    const response = await fetch("/api/v1/get-person-by-external-id", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ externalId })
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to load person: ${response.status}`);
                    }

                    const data = await response.json();
                    const person = data.person;

                    if (person) {
                        this._cachePerson(person);
                    }

                } catch (error) {
                    console.error("PersonService: Error loading person by externalId:", error);
                } finally {
                    this._loadingPromises.delete(externalId);
                }
            })();

            this._loadingPromises.set(externalId, promise);
            return promise;
        },

        /**
         * Preload specific persons by ID (for batch operations).
         * @param {string[]} personIds - Array of person IDs
         * @returns {Promise<void>}
         */
        async preloadPersonsById(personIds) {
            if (!personIds || personIds.length === 0) return;

            const promises = personIds
                .filter(id => id && id !== 'N/A' && !this._personCache.has(id))
                .map(id => this._loadPersonById(id));

            await Promise.allSettled(promises);
        },

        /**
         * Preload specific persons by externalId (for batch operations).
         * @param {string[]} externalIds - Array of external IDs
         * @returns {Promise<void>}
         */
        async preloadPersonsByExternalId(externalIds) {
            if (!externalIds || externalIds.length === 0) return;

            const promises = externalIds
                .filter(id => id && id !== 'N/A' && !this._personCache.has(id))
                .map(id => this._loadPersonByExternalId(id));

            await Promise.allSettled(promises);
        },

        /**
         * Load all persons from FSM API (for search functionality).
         * Use sparingly - loads 4000+ records.
         *
         * The backend returns ONE entry per human (the Person rows of one person
         * are merged), each carrying its other identities - see _cachePerson.
         * @returns {Promise<void>}
         */
        async loadAllPersons() {
            try {
                const response = await fetch("/api/v1/get-persons", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ loadAll: true })
                });

                if (!response.ok) {
                    throw new Error(`Failed to load persons: ${response.status}`);
                }

                const data = await response.json();
                const persons = data.persons || [];

                persons.forEach(person => {
                    this._cachePerson(person);
                });

            } catch (error) {
                console.error("PersonService: Error loading all persons:", error);
                throw error;
            }
        },

        /**
         * Format full name from first and last name.
         * @param {string} firstName - First name
         * @param {string} lastName - Last name
         * @returns {string} Full name or "Unknown"
         * @private
         */
        _formatFullName(firstName, lastName) {
            const parts = [];
            if (firstName) parts.push(firstName);
            if (lastName) parts.push(lastName);
            return parts.length > 0 ? parts.join(' ') : 'Unknown';
        },

        /**
         * Clear cache.
         */
        clearCache() {
            this._personCache.clear();
            this._loadingPromises.clear();
        }
    };
});