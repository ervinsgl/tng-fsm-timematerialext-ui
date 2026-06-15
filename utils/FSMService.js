/**
 * FSMService.js
 * 
 * Core backend service for SAP FSM (Field Service Management) API integration.
 * Provides authenticated HTTP methods and CRUD operations for FSM Data API.
 * 
 * T&M entry retrieval and lookup/reference data methods are loaded from
 * separate modules (FSMQueryService, FSMLookupService) and mixed into
 * this class at startup for a single unified API surface.
 * 
 * Core Methods (this file):
 * - makeRequest, postRequest, patchRequest - Authenticated HTTP methods
 * - makeBatchRequest, _parseBatchResponse - Batch API support
 * - batchCreateEntries, batchUpdateEntries, batchDeleteEntries - Batch CRUD
 * - Individual CRUD: create/update for Expense, Mileage, Material, TimeEffort
 * - Activity CRUD: getActivityById, getActivityByCode, getActivitiesForServiceCall
 * - makeQueryRequest - Query API support
 * 
 * Mixed-in from FSMQueryService.js:
 * - getTimeEffortsForActivity, getMaterialsForActivity
 * - getExpensesForActivity, getMileagesForActivity
 * 
 * Mixed-in from FSMLookupService.js:
 * - getTimeTasks, getItems, getExpenseTypes, getUdfMetaById
 * - getApprovalStatus, getApprovalStatusBatch
 * - getPersons, getPersonById, getPersonByExternalId, getBusinessPartnerByExternalId
 * - getOrganizationLevels, getUserByUsername, getPersonOrgLevelByUserId, getUserOrgLevel
 * 
 * @file FSMService.js
 * @module utils/FSMService
 * @requires axios
 * @requires ./DestinationService
 * @requires ./TokenCache
 * @requires ./FSMQueryService
 * @requires ./FSMLookupService
 */
const axios = require('axios');
const DestinationService = require('./DestinationService');
const TokenCache = require('./TokenCache');

class FSMService {
    constructor() {
        // BTP destination name — change here to update all methods (including mixed-in modules)
        this.destinationName = 'FSM_OAUTH_CONNECT';
    }

    /**
     * Extract and validate account/company from destination configuration.
     * Throws a clear error if either value is missing, so configuration
     * problems surface immediately instead of silently using wrong credentials.
     * @param {Object} destination - BTP destination object
     * @returns {{account: string, company: string}} Validated account and company
     * @throws {Error} If account or company is missing from destination
     */
    _getAccountCompany(destination) {
        const account = destination.destinationConfiguration.account;
        const company = destination.destinationConfiguration.company;

        if (!account) {
            throw new Error('FSMService: "account" is missing from destination configuration. Check BTP destination properties.');
        }
        if (!company) {
            throw new Error('FSMService: "company" is missing from destination configuration. Check BTP destination properties.');
        }

        return { account, company };
    }

    /**
     * Make authenticated request to FSM Data API (/api/data/v4 endpoints).
     * @param {string} path - API path (e.g., '/Activity/123')
     * @param {Object} [params={}] - Query parameters
     * @returns {Promise<Object>} API response data
     * @throws {Error} If request fails
     */
    async makeRequest(path, params = {}) {
        try {
            const destination = await DestinationService.getDestination(this.destinationName);
            const token = await TokenCache.getToken(destination);

            const baseUrl = destination.destinationConfiguration.URL;
            const fullUrl = `${baseUrl}/api/data/v4${path}`;
            const { account, company } = this._getAccountCompany(destination);

            const queryParams = {
                ...params,
                account,
                company
            };

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Account-ID': destination.destinationConfiguration['URL.headers.X-Account-ID'],
                'X-Company-ID': destination.destinationConfiguration['URL.headers.X-Company-ID'],
                'X-Client-ID': destination.destinationConfiguration['URL.headers.X-Client-ID'],
                'X-Client-Version': destination.destinationConfiguration['URL.headers.X-Client-Version']
            };

            const response = await axios.get(fullUrl, {
                params: queryParams,
                headers: headers
            });

            return response.data;

        } catch (error) {
            console.error('FSMService: API Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Make POST request to FSM API.
     * @param {string} path - API path (e.g., '/Expense')
     * @param {Object} data - Request body
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} API response
     */
    async postRequest(path, data, params = {}) {
        try {
            const destination = await DestinationService.getDestination(this.destinationName);
            const token = await TokenCache.getToken(destination);

            const baseUrl = destination.destinationConfiguration.URL;
            const fullUrl = `${baseUrl}/api/data/v4${path}`;
            const { account, company } = this._getAccountCompany(destination);

            const queryParams = {
                ...params,
                account,
                company
            };

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Account-ID': destination.destinationConfiguration['URL.headers.X-Account-ID'],
                'X-Company-ID': destination.destinationConfiguration['URL.headers.X-Company-ID'],
                'X-Client-ID': destination.destinationConfiguration['URL.headers.X-Client-ID'],
                'X-Client-Version': destination.destinationConfiguration['URL.headers.X-Client-Version']
            };

            const response = await axios.post(fullUrl, data, {
                params: queryParams,
                headers: headers
            });

            return response.data;

        } catch (error) {
            console.error('FSMService: POST Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Make PATCH request to FSM API.
     * @param {string} path - API path (e.g., '/Expense/ID')
     * @param {Object} data - Request body
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} Response data
     */
    async patchRequest(path, data, params = {}) {
        try {
            const destination = await DestinationService.getDestination(this.destinationName);
            const token = await TokenCache.getToken(destination);

            const baseUrl = destination.destinationConfiguration.URL;
            const fullUrl = `${baseUrl}/api/data/v4${path}`;
            const { account, company } = this._getAccountCompany(destination);

            const queryParams = {
                ...params,
                forceUpdate: true,
                account,
                company
            };

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Account-ID': destination.destinationConfiguration['URL.headers.X-Account-ID'],
                'X-Company-ID': destination.destinationConfiguration['URL.headers.X-Company-ID'],
                'X-Client-ID': destination.destinationConfiguration['URL.headers.X-Client-ID'],
                'X-Client-Version': destination.destinationConfiguration['URL.headers.X-Client-Version']
            };

            const response = await axios.patch(fullUrl, data, {
                params: queryParams,
                headers: headers
            });

            return response.data;

        } catch (error) {
            console.error('FSMService: PATCH Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Make batch request to FSM Batch API.
     * Combines multiple API calls into a single HTTP request.
     * @param {Array} requests - Array of request objects with structure:
     *   { method: 'POST', path: '/Expense', data: {...}, params: { dtos: '...' } }
     * @param {boolean} transactional - If true, all requests succeed or all rollback (default: true)
     * @returns {Promise<Array>} Array of response objects matching request order
     */
    async makeBatchRequest(requests, transactional = true) {
        try {
            if (!requests || requests.length === 0) {
                return [];
            }

            const destination = await DestinationService.getDestination(this.destinationName);
            const token = await TokenCache.getToken(destination);

            const baseUrl = destination.destinationConfiguration.URL;
            const { account, company } = this._getAccountCompany(destination);

            // Create unique boundary
            const boundary = `======batch_${Date.now()}======`;

            // Build multipart body
            let batchBody = '';
            requests.forEach((req, index) => {
                const contentId = `req${index + 1}`;
                
                // Build query string for this request
                const queryParams = new URLSearchParams({
                    ...req.params,
                    account,
                    company
                }).toString();

                const requestPath = `/api/data/v4${req.path}?${queryParams}`;

                batchBody += `--${boundary}\r\n`;
                batchBody += `Content-Type: application/http\r\n`;
                batchBody += `Content-ID: ${contentId}\r\n`;
                batchBody += `\r\n`;
                batchBody += `${req.method} ${requestPath} HTTP/1.1\r\n`;
                batchBody += `Content-Type: application/json\r\n`;
                batchBody += `\r\n`;
                
                if (req.data) {
                    batchBody += JSON.stringify(req.data);
                }
                batchBody += `\r\n`;
            });
            batchBody += `--${boundary}--\r\n`;

            // Make batch request
            const batchUrl = `${baseUrl}/api/data/batch/v1?account=${account}&company=${company}&transactional=${transactional}`;

            const headers = {
                'Content-Type': `multipart/mixed; boundary="${boundary}"`,
                'Authorization': `Bearer ${token}`,
                'X-Account-ID': destination.destinationConfiguration['URL.headers.X-Account-ID'],
                'X-Company-ID': destination.destinationConfiguration['URL.headers.X-Company-ID'],
                'X-Client-ID': destination.destinationConfiguration['URL.headers.X-Client-ID'],
                'X-Client-Version': destination.destinationConfiguration['URL.headers.X-Client-Version']
            };

            const response = await axios.post(batchUrl, batchBody, { headers });

            // Parse multipart response
            return this._parseBatchResponse(response.data, response.headers['content-type']);

        } catch (error) {
            console.error('FSMService: Batch Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Parse multipart batch response from FSM API.
     * 
     * Handles both:
     *   - Parts with JSON bodies (typical for POST/PATCH responses) — parsed as JSON
     *   - Parts without bodies (typical for DELETE 204 responses) — recorded with data: null
     *     A bodyless response with a 2xx status is still a success.
     * 
     * @param {string} responseBody - Raw multipart response body
     * @param {string} contentType - Content-Type header with boundary
     * @returns {Array} Array of parsed response objects
     */
    _parseBatchResponse(responseBody, contentType) {
        const results = [];

        try {
            // Extract boundary from content-type
            const boundaryMatch = contentType.match(/boundary=([^;]+)/);
            if (!boundaryMatch) {
                console.error('Could not extract boundary from response');
                return results;
            }

            const boundary = boundaryMatch[1].replace(/"/g, '');
            const parts = responseBody.split(`--${boundary}`);

            for (const part of parts) {
                // Skip empty parts and closing boundary
                if (!part.trim() || part.trim() === '--') continue;

                // Skip parts that aren't HTTP responses (e.g., changeset envelopes)
                const statusMatch = part.match(/HTTP\/1\.1 (\d+)/);
                if (!statusMatch) continue;

                const status = parseInt(statusMatch[1]);

                // Extract Content-ID if present
                const contentIdMatch = part.match(/Content-ID:\s*(\w+)/i);
                const contentId = contentIdMatch ? contentIdMatch[1] : null;

                // Try to parse JSON body — may not exist (e.g., DELETE 204 responses)
                const jsonMatch = part.match(/\{[\s\S]*\}/);
                let data = null;
                if (jsonMatch) {
                    try {
                        data = JSON.parse(jsonMatch[0]);
                    } catch (parseError) {
                        console.error('Error parsing batch response JSON:', parseError);
                        results.push({
                            success: false,
                            status,
                            contentId,
                            error: 'Failed to parse response body'
                        });
                        continue;
                    }
                }

                // A 2xx response with or without a body is a success.
                // A 4xx/5xx response is a failure regardless of body presence.
                results.push({
                    success: status >= 200 && status < 300,
                    status,
                    contentId,
                    data
                });
            }
        } catch (error) {
            console.error('Error parsing batch response:', error);
        }

        return results;
    }

    /**
     * Batch create multiple entries of different types.
     * @param {Array} entries - Array of entry objects with structure:
     *   { type: 'Expense'|'Mileage'|'Material'|'TimeEffort', payload: {...} }
     * @param {boolean} transactional - If true, all succeed or all rollback
     * @returns {Promise<Object>} Results object with successCount, errorCount, results
     */
    async batchCreateEntries(entries, transactional = false) {
        // Map entry types to API paths and DTOs
        const typeConfig = {
            'Expense': { path: '/Expense', dtos: 'Expense.17' },
            'Mileage': { path: '/Mileage', dtos: 'Mileage.19' },
            'Material': { path: '/Material', dtos: 'Material.22' },
            'TimeEffort': { path: '/TimeEffort', dtos: 'TimeEffort.17' }
        };

        // Build batch requests array
        const requests = entries.map(entry => {
            const config = typeConfig[entry.type];
            if (!config) {
                throw new Error(`Unknown entry type: ${entry.type}`);
            }
            return {
                method: 'POST',
                path: config.path,
                params: { dtos: config.dtos },
                data: entry.payload
            };
        });

        // Execute batch request
        const results = await this.makeBatchRequest(requests, transactional);

        // Summarize results
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;

        return {
            success: errorCount === 0,
            successCount,
            errorCount,
            totalCount: entries.length,
            results
        };
    }

    /**
     * Batch update multiple entries of different types.
     * @param {Array} entries - Array of entry objects with structure:
     *   { type: 'Expense'|'Mileage'|'Material'|'TimeEffort', id: '...', payload: {...} }
     * @param {boolean} transactional - If true, all succeed or all rollback
     * @returns {Promise<Object>} Results object with successCount, errorCount, results
     */
    async batchUpdateEntries(entries, transactional = false) {
        // Map entry types to API paths and DTOs
        const typeConfig = {
            'Expense': { path: '/Expense', dtos: 'Expense.17' },
            'Mileage': { path: '/Mileage', dtos: 'Mileage.19' },
            'Material': { path: '/Material', dtos: 'Material.22' },
            'TimeEffort': { path: '/TimeEffort', dtos: 'TimeEffort.17' }
        };

        // Build batch requests array
        const requests = entries.map(entry => {
            const config = typeConfig[entry.type];
            if (!config) {
                throw new Error(`Unknown entry type: ${entry.type}`);
            }
            if (!entry.id) {
                throw new Error(`Entry ID is required for update`);
            }
            return {
                method: 'PATCH',
                path: `${config.path}/${entry.id}`,
                params: { dtos: config.dtos, forceUpdate: true },
                data: entry.payload
            };
        });

        // Execute batch request
        const results = await this.makeBatchRequest(requests, transactional);

        // Summarize results
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;

        return {
            success: errorCount === 0,
            successCount,
            errorCount,
            totalCount: entries.length,
            results
        };
    }

    /**
     * Batch delete multiple T&M entries using FSM Batch API.
     * Uses DELETE method for each entry in a single batch request.
     * FSM DELETE requires lastChanged for optimistic locking.
     * @param {Array<Object>} entries - Array of entries to delete
     * @param {string} entries[].type - Entry type: 'Expense', 'Mileage', 'Material', 'TimeEffort'
     * @param {string} entries[].id - Entry ID to delete
     * @param {number} entries[].lastChanged - Last changed timestamp for optimistic locking
     * @param {boolean} [transactional=false] - If true, all-or-nothing; if false, partial success allowed
     * @returns {Promise<Object>} Batch result summary
     */
    async batchDeleteEntries(entries, transactional = false) {
        // Map entry types to API paths
        const typeConfig = {
            'Expense': { path: '/Expense' },
            'Mileage': { path: '/Mileage' },
            'Material': { path: '/Material' },
            'TimeEffort': { path: '/TimeEffort' }
        };

        // Build batch requests array
        const requests = entries.map(entry => {
            const config = typeConfig[entry.type];
            if (!config) {
                throw new Error(`Unknown entry type: ${entry.type}`);
            }
            if (!entry.id) {
                throw new Error(`Entry ID is required for delete`);
            }
            if (!entry.lastChanged) {
                throw new Error(`lastChanged is required for delete`);
            }
            return {
                method: 'DELETE',
                path: `${config.path}/${entry.id}`,
                params: { lastChanged: entry.lastChanged }
            };
        });

        // Execute batch request
        const results = await this.makeBatchRequest(requests, transactional);

        // Summarize results
        const deleteSuccessCount = results.filter(r => r.success).length;
        const deleteErrorCount = results.filter(r => !r.success).length;

        return {
            success: deleteErrorCount === 0,
            successCount: deleteSuccessCount,
            errorCount: deleteErrorCount,
            totalCount: entries.length,
            results
        };
    }

    /**
     * Update Expense in FSM.
     * @param {string} expenseId - Expense ID
     * @param {Object} expenseData - Expense update payload
     * @returns {Promise<Object>} Updated expense data
     */
    async updateExpense(expenseId, expenseData) {
        return this.patchRequest(`/Expense/${expenseId}`, expenseData, { dtos: 'Expense.17' });
    }

    /**
     * Create Expense in FSM.
     * @param {Object} expenseData - Expense payload
     * @returns {Promise<Object>} Created expense data
     */
    async createExpense(expenseData) {
        return this.postRequest('/Expense', expenseData, { dtos: 'Expense.17' });
    }

    /**
     * Create Mileage in FSM.
     * @param {Object} mileageData - Mileage payload
     * @returns {Promise<Object>} Created mileage data
     */
    async createMileage(mileageData) {
        return this.postRequest('/Mileage', mileageData, { dtos: 'Mileage.19' });
    }

    /**
     * Update Mileage in FSM.
     * @param {string} mileageId - Mileage ID
     * @param {Object} mileageData - Mileage update payload
     * @returns {Promise<Object>} Updated mileage data
     */
    async updateMileage(mileageId, mileageData) {
        return this.patchRequest(`/Mileage/${mileageId}`, mileageData, { dtos: 'Mileage.19' });
    }

    /**
     * Create Material in FSM.
     * @param {Object} materialData - Material payload
     * @returns {Promise<Object>} Created material data
     */
    async createMaterial(materialData) {
        return this.postRequest('/Material', materialData, { dtos: 'Material.22' });
    }

    /**
     * Create TimeEffort in FSM.
     * @param {Object} timeEffortData - TimeEffort payload
     * @returns {Promise<Object>} Created time effort data
     */
    async createTimeEffort(timeEffortData) {
        return this.postRequest('/TimeEffort', timeEffortData, { dtos: 'TimeEffort.17' });
    }

    /**
     * Update Material in FSM.
     * @param {string} materialId - Material ID
     * @param {Object} materialData - Material update payload
     * @returns {Promise<Object>} Updated material data
     */
    async updateMaterial(materialId, materialData) {
        return this.patchRequest(`/Material/${materialId}`, materialData, { dtos: 'Material.22' });
    }

    /**
     * Update TimeEffort in FSM.
     * @param {string} timeEffortId - TimeEffort ID
     * @param {Object} timeEffortData - TimeEffort update payload
     * @returns {Promise<Object>} Updated time effort data
     */
    async updateTimeEffort(timeEffortId, timeEffortData) {
        return this.patchRequest(`/TimeEffort/${timeEffortId}`, timeEffortData, { dtos: 'TimeEffort.17' });
    }

    /**
     * Get activity by ID.
     * @param {string} activityId - Activity ID
     * @returns {Promise<Object>} Activity data
     */
    async getActivityById(activityId) {
        return this.makeRequest(`/Activity/${activityId}`, { dtos: 'Activity.40' });
    }

    /**
     * Get activity by code (external ID).
     * @param {string} activityCode - Activity external code
     * @returns {Promise<Object>} Activity data
     */
    async getActivityByCode(activityCode) {
        return this.makeRequest(`/Activity/externalId/${activityCode}`, { dtos: 'Activity.40' });
    }

    /**
     * Get activities for service call using composite-tree API.
     * @param {string} serviceCallId - Service call ID
     * @returns {Promise<Object>} Service call with nested activities
     */
    async getActivitiesForServiceCall(serviceCallId) {
        try {
            const destination = await DestinationService.getDestination(this.destinationName);
            const token = await TokenCache.getToken(destination);

            const baseUrl = destination.destinationConfiguration.URL;
            const fullUrl = `${baseUrl}/api/service-management/v2/composite-tree/service-calls/${serviceCallId}`;

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Client-ID': 'FSM_EXTENSION',
                'X-Client-Version': '1.0.0',
                'X-Account-ID': destination.destinationConfiguration['URL.headers.X-Account-ID'],
                'X-Company-ID': destination.destinationConfiguration['URL.headers.X-Company-ID']
            };

            const response = await axios.get(fullUrl, { headers });
            return response.data;

        } catch (error) {
            console.error('FSMService: Composite-tree API Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Update activity.
     * @param {string} activityId - Activity ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object>} Updated activity data
     */
    async updateActivity(activityId, updateData) {
        const destination = await DestinationService.getDestination(this.destinationName);
        const token = await TokenCache.getToken(destination);

        const baseUrl = destination.destinationConfiguration.URL;
        const fullUrl = `${baseUrl}/api/data/v4/Activity/${activityId}`;
        const { account, company } = this._getAccountCompany(destination);

        const queryParams = {
            dtos: 'Activity.40',
            account,
            company
        };

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Account-ID': destination.destinationConfiguration['URL.headers.X-Account-ID'],
            'X-Company-ID': destination.destinationConfiguration['URL.headers.X-Company-ID'],
            'X-Client-ID': destination.destinationConfiguration['URL.headers.X-Client-ID'],
            'X-Client-Version': destination.destinationConfiguration['URL.headers.X-Client-Version']
        };

        const response = await axios.put(fullUrl, updateData, {
            params: queryParams,
            headers: headers
        });

        return response.data;
    }

    /**
     * Make Query API request (/api/query/v1 endpoints).
     * @param {string} query - FSQL query string
     * @param {string} dtos - DTO version string
     * @returns {Promise<Object>} Query response data
     */
    async makeQueryRequest(query, dtos) {
        try {
            const destination = await DestinationService.getDestination(this.destinationName);
            const token = await TokenCache.getToken(destination);

            const baseUrl = destination.destinationConfiguration.URL;
            const queryUrl = `${baseUrl}/api/query/v1`;
            const { account, company } = this._getAccountCompany(destination);

            const queryParams = {
                query: query,
                dtos: dtos,
                account,
                company
            };

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Account-ID': destination.destinationConfiguration['URL.headers.X-Account-ID'],
                'X-Company-ID': destination.destinationConfiguration['URL.headers.X-Company-ID'],
                'X-Client-ID': destination.destinationConfiguration['URL.headers.X-Client-ID'],
                'X-Client-Version': destination.destinationConfiguration['URL.headers.X-Client-Version']
            };

            const response = await axios.get(queryUrl, {
                params: queryParams,
                headers: headers
            });

            return response.data;

        } catch (error) {
            console.error('FSMService: Query API Error:', error.response?.data || error.message);
            throw error;
        }
    }

}

// Mix in methods from sub-modules
const FSMQueryService = require('./FSMQueryService');
const FSMLookupService = require('./FSMLookupService');
Object.assign(FSMService.prototype, FSMQueryService, FSMLookupService);

module.exports = new FSMService();