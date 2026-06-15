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
     * Get Person's orgLevel by user ID.
     * @param {string} userId - User ID from User API
     * @returns {Promise<Object|null>} Object with orgLevel and orgLevelIds
     */
    async getPersonOrgLevelByUserId(userId) {
        try {
            if (!userId) return null;

            const query = `SELECT w.id, w.externalId, w.orgLevel, w.orgLevelIds FROM Person w WHERE w.userName = '${userId}'`;
            const data = await this.makeQueryRequest(query, 'Person.25');

            if (!data.data || data.data.length === 0) {
                return null;
            }

            const personData = data.data[0].w;
            return {
                orgLevel: personData.orgLevel || null,
                orgLevelIds: personData.orgLevelIds || null,
                personId: personData.id || null,
                personExternalId: personData.externalId || null
            };

        } catch (error) {
            console.error('FSMService: Person orgLevel query Error:', error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Get User's Organization Level (combined flow).
     * 1. Get user by username -> get user ID
     * 2. Query Person table with user ID -> get orgLevel/orgLevelIds
     * @param {string} username - Username from FSM Mobile context
     * @returns {Promise<Object|null>} Object with orgLevel info
     */
    async getUserOrgLevel(username) {
        try {
            const user = await this.getUserByUsername(username);
            if (!user || !user.id) {
                return null;
            }

            const orgLevelData = await this.getPersonOrgLevelByUserId(user.id);
            if (!orgLevelData) {
                return null;
            }

            return {
                userId: user.id,
                userName: username,
                userFirstName: user.firstName,
                userLastName: user.lastName,
                orgLevel: orgLevelData.orgLevel,
                orgLevelIds: orgLevelData.orgLevelIds,
                personIds: orgLevelData.personId ? [orgLevelData.personId] : [],
                personExternalIds: orgLevelData.personExternalId ? [orgLevelData.personExternalId] : []
            };

        } catch (error) {
            console.error('FSMService: getUserOrgLevel Error:', error.message);
            throw error;
        }
    }
};