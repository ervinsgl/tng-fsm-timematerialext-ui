/**
 * OrganizationService.js
 * 
 * Frontend service for organization level management.
 * Handles caching of org hierarchy and user org level resolution.
 * 
 * Key Features:
 * - Caches full organizational hierarchy from FSM
 * - Formats org level IDs (raw â†’ UUID format)
 * - Resolves user's org level from username
 * - Provides lookup methods for org level names
 * 
 * Flow for User Org Level Resolution:
 * 1. getUserResolvedOrgLevel(username)
 * 2. â†’ fetchUserOrgLevel() calls /api/get-user-org-level
 * 3. â†’ Backend: User API (get user ID) â†’ Query API (get orgLevel)
 * 4. â†’ findMatchingOrgLevel() matches against cached hierarchy
 * 5. â†’ Returns resolved org level with id, name, etc.
 * 
 * @file OrganizationService.js
 * @module com/tng/fsm/timematerialext/app/utils/services/OrganizationService
 */
sap.ui.define([], () => {
    "use strict";

    return {
        /**
         * Cache for organizational level data (full hierarchy)
         * @type {Map<string, Object>}
         * @private
         */
        _orgLevelCache: new Map(),
        
        /**
         * Flag indicating if hierarchy has been loaded
         * @type {boolean}
         * @private
         */
        _hierarchyLoaded: false,

        /**
         * Format organization level ID for lookup
         * Converts: 2B6F748557D44F249F6BEFC6D0FB07B0
         * To:       2b6f7485-57d4-4f24-9f6b-efc6d0fb07b0
         */
        formatOrgLevelId(orgLevelId) {
            if (!orgLevelId) return null;
            
            // Remove any existing hyphens and convert to lowercase
            const cleaned = orgLevelId.replace(/-/g, '').toLowerCase();
            
            // Add hyphens in UUID format: 8-4-4-4-12
            if (cleaned.length === 32) {
                return `${cleaned.substring(0, 8)}-${cleaned.substring(8, 12)}-${cleaned.substring(12, 16)}-${cleaned.substring(16, 20)}-${cleaned.substring(20, 32)}`;
            }
            
            return orgLevelId; // Return as-is if not 32 characters
        },

        /**
         * Load full organizational hierarchy and populate cache
         */
        async loadOrganizationalHierarchy() {
            if (this._hierarchyLoaded) {
                return;
            }

            try {
                const response = await fetch("/api/v1/get-organization-levels-full", {
                    method: "GET",
                    headers: { "Content-Type": "application/json" }
                });

                if (!response.ok) {
                    throw new Error(`Failed to load organization levels: ${response.status}`);
                }

                const data = await response.json();
                
                // Recursively process all levels and sublevels
                if (data.level && data.level.subLevels) {
                    this._processLevelsRecursive(data.level.subLevels);
                }

                this._hierarchyLoaded = true;

            } catch (error) {
                console.error("OrganizationService: Error loading hierarchy:", error);
                throw error;
            }
        },

        /**
         * Recursively process organization levels and add to cache
         */
        _processLevelsRecursive(levels) {
            if (!levels || !Array.isArray(levels)) return;

            levels.forEach(level => {
                // Cache this level
                const orgLevelData = {
                    id: level.id,
                    name: level.name || '',
                    shortDescription: level.shortDescription || level.name || '',
                    longDescription: level.longDescription || level.name || ''
                };

                this._orgLevelCache.set(level.id, orgLevelData);

                // Process sublevels recursively
                if (level.subLevels && Array.isArray(level.subLevels)) {
                    this._processLevelsRecursive(level.subLevels);
                }
            });
        },

        /**
         * Get organization level display text by ID
         * Automatically formats the ID and looks up in cache
         * Format: "2130_MPA_TEAM1"
         */
        getOrgLevelDisplayTextById(orgLevelId) {
            if (!orgLevelId || orgLevelId === 'N/A') return 'N/A';

            // Format ID to UUID format
            const formattedId = this.formatOrgLevelId(orgLevelId);

            // Check cache
            const orgLevel = this._orgLevelCache.get(formattedId);
            if (orgLevel) {
                return orgLevel.name || orgLevel.shortDescription;
            }

            // If not in cache, try to load hierarchy (async)
            if (!this._hierarchyLoaded) {
                this.loadOrganizationalHierarchy();
            }

            // Return original ID if not found
            return orgLevelId;
        },

        /**
         * Clear cache
         */
        clearCache() {
            this._orgLevelCache.clear();
            this._hierarchyLoaded = false;
        },

        /**
         * Fetch user's organization level from backend
         * @param {string} username - Username from FSM Mobile context
         * @returns {Promise<Object|null>} User org level data or null
         */
        async fetchUserOrgLevel(username) {
            try {
                if (!username) {
                    return null;
                }

                const response = await fetch("/api/v1/get-user-org-level", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: username })
                });

                if (!response.ok) {
                    return null;
                }

                const data = await response.json();
                return data.success ? data.data : null;

            } catch (error) {
                console.error("OrganizationService: Error fetching user org level:", error);
                return null;
            }
        },

        /**
         * Find matching organization level in hierarchy
         * Matches orgLevel (formatted to UUID) or orgLevelIds against cached hierarchy
         * @param {string} orgLevel - Raw orgLevel ID (e.g., "2B6F748557D44F249F6BEFC6D0FB07B0")
         * @param {Array} orgLevelIds - Array of orgLevel IDs (fallback if orgLevel doesn't match)
         * @returns {Object|null} Matched org level from cache or null
         */
        findMatchingOrgLevel(orgLevel, orgLevelIds) {
            // First try to match orgLevel (primary)
            if (orgLevel) {
                const formattedId = this.formatOrgLevelId(orgLevel);
                const matched = this._orgLevelCache.get(formattedId);
                if (matched) {
                    return {
                        ...matched,
                        matchedBy: 'orgLevel',
                        originalId: orgLevel,
                        formattedId: formattedId
                    };
                }
            }

            // Fallback to orgLevelIds array
            if (orgLevelIds && Array.isArray(orgLevelIds) && orgLevelIds.length > 0) {
                for (const id of orgLevelIds) {
                    const formattedId = this.formatOrgLevelId(id);
                    const matched = this._orgLevelCache.get(formattedId);
                    if (matched) {
                        return {
                            ...matched,
                            matchedBy: 'orgLevelIds',
                            originalId: id,
                            formattedId: formattedId
                        };
                    }
                }
            }

            return null;
        },

        /**
         * Get user's resolved organization level
         * Combines fetching user org level and matching against hierarchy
         * @param {string} username - Username from FSM Mobile context
         * @returns {Promise<Object|null>} Resolved org level with display info or null
         */
        async getUserResolvedOrgLevel(username) {
            try {
                // Ensure hierarchy is loaded
                if (!this._hierarchyLoaded) {
                    await this.loadOrganizationalHierarchy();
                }

                // Fetch user's org level from backend
                const userOrgData = await this.fetchUserOrgLevel(username);
                if (!userOrgData) {
                    return null;
                }

                // Find matching org level in hierarchy
                const matched = this.findMatchingOrgLevel(userOrgData.orgLevel, userOrgData.orgLevelIds);
                if (!matched) {
                    return {
                        found: false,
                        personIds: userOrgData.personIds,
                        personExternalIds: userOrgData.personExternalIds,
                        userOrgData: userOrgData,
                        message: 'Organization level not found in hierarchy'
                    };
                }

                return {
                    found: true,
                    id: matched.id,
                    name: matched.name,
                    shortDescription: matched.shortDescription,
                    longDescription: matched.longDescription,
                    matchedBy: matched.matchedBy,
                    originalId: matched.originalId,
                    formattedId: matched.formattedId,
                    personIds: userOrgData.personIds,
                    personExternalIds: userOrgData.personExternalIds,
                    userOrgData: userOrgData
                };

            } catch (error) {
                console.error("OrganizationService: Error resolving user org level:", error);
                return null;
            }
        }
    };
});