/**
 * FSMLookupService.js
 * 
 * Lookup and reference data methods for FSM API integration.
 * Provides data fetching for reference tables, approval status,
 * person/technician data, organization hierarchy, and user management.
 * 
 * These methods are mixed into the FSMService class prototype at startup,
 * so they have access to FSMService's instance properties and HTTP methods via `this`.
 * Destination names are defined centrally in FSMService constructor.
 * 
 * Sections:
 * - LOOKUP DATA: TimeTasks, Items, ExpenseTypes, UdfMeta
 * - APPROVAL STATUS: Decision status for T&M entries
 * - PERSON/TECHNICIAN: Person queries by ID, externalId, BusinessPartner
 * - ORGANIZATION: Organization level hierarchy
 * - USER: User API lookup, combined user-org-level flow
 *   (with UnifiedPerson fallback for accounts where Person.userName
 *    stores the login name instead of the User API id)
 * 
 * @file FSMLookupService.js
 * @module utils/FSMLookupService
 * @requires ./DestinationService (via FSMService `this` context)
 * @requires ./TokenCache (via FSMService `this` context)
 */

const axios = require('axios');
const DestinationService = require('./DestinationService');
const TokenCache = require('./TokenCache');

module.exports = {

    // ========================================
    // LOOKUP DATA
    // ========================================

    /**
     * Get all Time Tasks for lookup/dropdown.
     * @returns {Promise<Array<{id: string, code: string, name: string}>>}
     */
    async getTimeTasks() {
        try {
            const data = await this.makeRequest('/TimeTask', {
                dtos: 'TimeTask.18',
                fields: 'name,id,code'
            });

            if (!data.data || data.data.length === 0) {
                return [];
            }

            return data.data.map(item => ({
                id: item.timeTask.id,
                code: item.timeTask.code,
                name: item.timeTask.name
            }));

        } catch (error) {
            console.error("FSMService: Error fetching time tasks:", error.message);
            return [];
        }
    },

    /**
     * Get all Items for lookup/dropdown.
     * Excludes tools and Z11% items.
     * @returns {Promise<Array<{id: string, externalId: string, name: string}>>}
     */
    async getItems() {
        try {
            const query = `SELECT DISTINCT w.name, w.externalId, w.id 
                           FROM Item w 
                           WHERE w.tool = false 
                           AND w.externalId NOT LIKE 'Z11%'`;
            
            const data = await this.makeQueryRequest(query, 'Item.24');

            if (!data.data || data.data.length === 0) {
                return [];
            }

            return data.data.map(item => ({
                id: item.w.id,
                externalId: item.w.externalId,
                name: item.w.name
            }));

        } catch (error) {
            console.error("FSMService: Error fetching items:", error.message);
            return [];
        }
    },

    /**
     * Get all Expense Types for lookup/dropdown.
     * @returns {Promise<Array<{id: string, code: string, name: string}>>}
     */
    async getExpenseTypes() {
        try {
            const data = await this.makeRequest('/ExpenseType', {
                dtos: 'ExpenseType.17',
                fields: 'name,id,code'
            });

            if (!data.data || data.data.length === 0) {
                return [];
            }

            return data.data.map(item => ({
                id: item.expenseType.id,
                code: item.expenseType.code,
                name: item.expenseType.name
            }));

        } catch (error) {
            console.error("FSMService: Error fetching expense types:", error.message);
            return [];
        }
    },

    /**
     * Get UDF Meta externalId by ID.
     * @param {string} udfMetaId - UDF Meta ID
     * @returns {Promise<string|null>} externalId or null if not found
     */
    async getUdfMetaById(udfMetaId) {
        try {
            const query = `SELECT w.externalId FROM UdfMeta w WHERE w.id = '${udfMetaId}'`;
            const data = await this.makeQueryRequest(query, 'UdfMeta.20');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            return data.data[0]?.w?.externalId || null;

        } catch (error) {
            console.error("FSMService: Error fetching UDF Meta:", error.message);
            return null;
        }
    },

    // ========================================
    // APPROVAL STATUS
    // ========================================

    /**
     * Get Approval Decision Status for a T&M entry.
     * @param {string} objectId - The T&M entry ID
     * @returns {Promise<Object|null>} Object with decisionStatus and decisionRemarks, or null
     */
    async getApprovalStatus(objectId) {
        try {
            const query = `SELECT w.decisionStatus, w.decisionRemarks FROM Approval w WHERE w.object.objectId = '${objectId}'`;
            const data = await this.makeQueryRequest(query, 'Approval.15');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            return {
                decisionStatus: data.data[0]?.w?.decisionStatus || null,
                decisionRemarks: data.data[0]?.w?.decisionRemarks || null
            };

        } catch (error) {
            console.error("FSMService: Error fetching Approval status:", error.message);
            return null;
        }
    },

    /**
     * Get Approval Decision Status for multiple T&M entries.
     * @param {string[]} objectIds - Array of T&M entry IDs
     * @returns {Promise<Object>} Map of objectId to {decisionStatus, decisionRemarks}
     */
    async getApprovalStatusBatch(objectIds) {
        try {
            if (!objectIds || objectIds.length === 0) {
                return {};
            }

            const statusMap = {};
            
            const promises = objectIds.map(async (objectId) => {
                try {
                    const query = `SELECT w.decisionStatus, w.decisionRemarks FROM Approval w WHERE w.object.objectId = '${objectId}'`;
                    const data = await this.makeQueryRequest(query, 'Approval.15');
                    
                    if (data.data && data.data.length > 0) {
                        const approval = data.data[0]?.w;
                        if (approval?.decisionStatus) {
                            statusMap[objectId] = {
                                decisionStatus: approval.decisionStatus,
                                decisionRemarks: approval.decisionRemarks || null
                            };
                        }
                    }
                } catch (err) {
                    console.error('FSMService: Error fetching approval for', objectId, ':', err.message);
                }
            });
            
            await Promise.all(promises);
            return statusMap;

        } catch (error) {
            console.error("FSMService: Error fetching Approval statuses batch:", error.message);
            return {};
        }
    },

    // ========================================
    // PERSON/TECHNICIAN DATA
    // ========================================

    /**
     * Get all Persons (Technicians).
     * @returns {Promise<Array<{id: string, externalId: string, firstName: string, lastName: string}>>}
     */
    async getPersons() {
        try {
            const query = `SELECT w.id, w.externalId, w.firstName, w.lastName FROM Person w WHERE w.externalId IS NOT NULL`;
            const data = await this.makeQueryRequest(query, 'Person.25');

            if (!data.data || data.data.length === 0) {
                return [];
            }

            return data.data.map(item => ({
                id: item.w.id,
                externalId: item.w.externalId,
                firstName: item.w.firstName || '',
                lastName: item.w.lastName || ''
            }));

        } catch (error) {
            console.error("FSMService: Error fetching persons:", error.message);
            return [];
        }
    },

    /**
     * Get Person by ID.
     * @param {string} personId - Person ID
     * @returns {Promise<Object|null>} Person object or null
     */
    async getPersonById(personId) {
        try {
            if (!personId) return null;

            const query = `SELECT w.id, w.externalId, w.firstName, w.lastName FROM Person w WHERE w.id = '${personId}'`;
            const data = await this.makeQueryRequest(query, 'Person.25');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            return {
                id: data.data[0].w.id,
                externalId: data.data[0].w.externalId,
                firstName: data.data[0].w.firstName || '',
                lastName: data.data[0].w.lastName || ''
            };

        } catch (error) {
            console.error("FSMService: Error fetching person by ID:", error.message);
            return null;
        }
    },

    /**
     * Get Person by External ID.
     * @param {string} externalId - Person External ID
     * @returns {Promise<Object|null>} Person object or null
     */
    async getPersonByExternalId(externalId) {
        try {
            if (!externalId) return null;

            const query = `SELECT w.id, w.externalId, w.firstName, w.lastName FROM Person w WHERE w.externalId = '${externalId}'`;
            const data = await this.makeQueryRequest(query, 'Person.25');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            return {
                id: data.data[0].w.id,
                externalId: data.data[0].w.externalId,
                firstName: data.data[0].w.firstName || '',
                lastName: data.data[0].w.lastName || ''
            };

        } catch (error) {
            console.error("FSMService: Error fetching person by externalId:", error.message);
            return null;
        }
    },

    /**
     * Get Business Partner by External ID.
     * @param {string} externalId - Business Partner External ID
     * @returns {Promise<Object|null>} Business Partner object or null
     */
    async getBusinessPartnerByExternalId(externalId) {
        try {
            if (!externalId) return null;

            const query = `SELECT w.name FROM BusinessPartner w WHERE w.externalId = '${externalId}'`;
            const data = await this.makeQueryRequest(query, 'BusinessPartner.25');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            return {
                externalId: externalId,
                name: data.data[0].w.name || ''
            };

        } catch (error) {
            console.error("FSMService: Error fetching business partner:", error.message);
            return null;
        }
    },

    // ========================================
    // ORGANIZATION LEVEL
    // ========================================

    /**
     * Get Organization Levels hierarchy.
     * @returns {Promise<Object>} Organization level hierarchy
     */
    async getOrganizationLevels() {
        try {
            const destination = await DestinationService.getDestination(this.destinationName);
            const token = await TokenCache.getToken(destination);

            const baseUrl = destination.destinationConfiguration.URL;
            const fullUrl = `${baseUrl}/cloud-org-level-service/api/v1/levels`;

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Account-ID': destination.destinationConfiguration['URL.headers.X-Account-ID'],
                'X-Company-ID': destination.destinationConfiguration['URL.headers.X-Company-ID']
            };

            const response = await axios.get(fullUrl, { headers });
            return response.data;

        } catch (error) {
            console.error('FSMService: Organizational-levels API Error:', error.response?.data || error.message);
            throw error;
        }
    },

    // ========================================
    // USER API
    // ========================================

    /**
     * Get User by username from User API.
     * @param {string} username - Username (e.g., "EGLEIZDS")
     * @returns {Promise<Object|null>} User object or null
     */
    async getUserByUsername(username) {
        try {
            if (!username) return null;

            const destination = await DestinationService.getDestination(this.destinationName);
            const token = await TokenCache.getToken(destination);

            const baseUrl = destination.destinationConfiguration.URL;
            const { account } = this._getAccountCompany(destination);
            const fullUrl = `${baseUrl}/api/user/v1/users`;

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Account-ID': destination.destinationConfiguration['URL.headers.X-Account-ID'],
                'X-Company-ID': destination.destinationConfiguration['URL.headers.X-Company-ID'],
                'X-Client-ID': destination.destinationConfiguration['URL.headers.X-Client-ID'],
                'X-Client-Version': destination.destinationConfiguration['URL.headers.X-Client-Version']
            };

            const response = await axios.get(fullUrl, {
                params: {
                    name: username,
                    account: account
                },
                headers: headers
            });

            if (response.data && response.data.content && response.data.content.length > 0) {
                const user = response.data.content[0];
                return {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    name: user.name,
                    companies: user.companies || []
                };
            }

            return null;

        } catch (error) {
            console.error('FSMService: User API Error:', error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Get Person's orgLevel + identity by user ID.
     *
     * Selects id/externalId in addition to orgLevel so the activity
     * assignment filter (responsible / supporting technician) can compare
     * the user's person identity against each activity. Without these the
     * assignment filter is skipped and all org-matched activities show.
     *
     * The same human can have multiple Person rows for one userName
     * (e.g. EMPLOYEE + ERPUSER), each with its own id/externalId. An activity
     * may be assigned against either row, so ALL identities are collected and
     * returned as arrays; the assignment filter matches on any of them.
     *
     * @param {string} userId - User ID from User API
     * @returns {Promise<Object|null>} Object with orgLevel, orgLevelIds, personIds[], personExternalIds[]
     */
    async getPersonOrgLevelByUserId(userId) {
        try {
            if (!userId) return null;

            const query = `SELECT w.id, w.externalId, w.orgLevel, w.orgLevelIds FROM Person w WHERE w.userName = '${userId}'`;
            const data = await this.makeQueryRequest(query, 'Person.25');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            // Collect every identity row for this userName, not just row 0.
            const rows = data.data.map(r => r.w).filter(Boolean);

            const personIds = [...new Set(rows.map(r => r.id).filter(Boolean))];
            const personExternalIds = [...new Set(rows.map(r => r.externalId).filter(Boolean))];

            // orgLevel is shared across the duplicate rows; take the first
            // populated one rather than assuming row 0 carries it.
            const orgLevelRow = rows.find(r => r.orgLevel) || rows[0];

            return {
                orgLevel: orgLevelRow.orgLevel || null,
                orgLevelIds: orgLevelRow.orgLevelIds || null,
                personIds,
                personExternalIds
            };

        } catch (error) {
            console.error('FSMService: Person orgLevel query Error:', error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Fallback: get Person's orgLevel + identity via UnifiedPerson by the raw context user value.
     *
     * Why this exists: Person.userName is supposed to contain the User API id
     * (e.g. '605269'), but in some FSM accounts (observed in QA) it contains
     * the login name instead (e.g. '61'). In those accounts the primary
     * Person lookup by User API id finds nothing. UnifiedPerson queried with
     * the raw context value resolves the same person and returns the same
     * orgLevel + identity fields.
     *
     * Selects id/externalId here too so the assignment filter works on the
     * fallback path as well, not only the primary path.
     *
     * @param {string} contextUserValue - User value exactly as delivered by FSM context
     * @returns {Promise<Object|null>} Object with orgLevel, orgLevelIds, personIds[], personExternalIds[], or null
     */
    async getUnifiedPersonOrgLevel(contextUserValue) {
        try {
            if (!contextUserValue) return null;

            const query = `SELECT w.id, w.externalId, w.orgLevel, w.orgLevelIds FROM UnifiedPerson w WHERE w.userName = '${contextUserValue}'`;
            const data = await this.makeQueryRequest(query, 'UnifiedPerson.13');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            // Collect every identity row (EMPLOYEE + ERPUSER etc.), same as the
            // primary Person path, so the assignment filter can match on any.
            const rows = data.data.map(r => r.w).filter(Boolean);

            const personIds = [...new Set(rows.map(r => r.id).filter(Boolean))];
            const personExternalIds = [...new Set(rows.map(r => r.externalId).filter(Boolean))];
            const orgLevelRow = rows.find(r => r.orgLevel) || rows[0];

            return {
                orgLevel: orgLevelRow.orgLevel || null,
                orgLevelIds: orgLevelRow.orgLevelIds || null,
                personIds,
                personExternalIds
            };

        } catch (error) {
            // Fallback failure must not mask the primary path result —
            // log and return null so getUserOrgLevel reports "not found" cleanly.
            console.error('FSMService: UnifiedPerson orgLevel query Error:', error.response?.data || error.message);
            return null;
        }
    },

    /**
     * Get User's Organization Level (combined flow with fallback).
     *
     * Primary path:
     * 1. Resolve login name -> user id via User API
     * 2. Query Person with that user id -> orgLevel/orgLevelIds + identity
     *
     * Fallback path (when primary finds nothing):
     * 3. Query UnifiedPerson with the raw context value -> orgLevel/orgLevelIds + identity
     *    Covers accounts where Person.userName stores the login name
     *    instead of the User API id (environment data discrepancy).
     *
     * personIds / personExternalIds are returned as arrays so the activity
     * assignment filter can match the user against each activity's
     * responsible / supporting technicians.
     *
     * @param {string} username - User value from FSM context (login name or id)
     * @returns {Promise<Object|null>} Object with orgLevel info + person identity, or null if unresolvable
     */
    async getUserOrgLevel(username) {
        try {
            if (!username) {
                return null;
            }

            // Step 1: resolve via User API (non-fatal — fallback still runs if this fails)
            let user = null;
            try {
                user = await this.getUserByUsername(username);
            } catch (error) {
                console.error('FSMService: User API lookup failed, continuing to fallback:', error.message);
            }

            // Step 2: primary — Person keyed by User API id
            let orgLevelData = null;
            let resolvedVia = null;
            if (user && user.id) {
                orgLevelData = await this.getPersonOrgLevelByUserId(user.id);
                if (orgLevelData) {
                    resolvedVia = 'Person (by User API id)';
                }
            }

            // Step 3: fallback — UnifiedPerson keyed by raw context value
            if (!orgLevelData) {
                console.log(`FSMService: Person lookup empty for user '${username}', falling back to UnifiedPerson`);
                orgLevelData = await this.getUnifiedPersonOrgLevel(username);
                if (orgLevelData) {
                    resolvedVia = 'UnifiedPerson (by context value)';
                }
            }

            if (!orgLevelData) {
                return null;
            }

            console.log(`FSMService: User org level resolved via ${resolvedVia} for '${username}'`);

            return {
                userId: user?.id || username,
                userName: username,
                userFirstName: user?.firstName || null,
                userLastName: user?.lastName || null,
                orgLevel: orgLevelData.orgLevel,
                orgLevelIds: orgLevelData.orgLevelIds,
                personIds: orgLevelData.personIds || [],
                personExternalIds: orgLevelData.personExternalIds || []
            };

        } catch (error) {
            console.error('FSMService: getUserOrgLevel Error:', error.message);
            throw error;
        }
    }
};