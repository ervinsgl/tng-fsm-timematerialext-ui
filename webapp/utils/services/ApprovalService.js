/**
 * ApprovalService.js
 * 
 * Frontend service for T&M entry approval status management.
 * Handles fetching, caching, and displaying approval decision statuses and remarks.
 * 
 * Key Features:
 * - Batch fetch approval statuses and decision remarks for multiple T&M entries
 * - Cache statuses to avoid redundant API calls
 * - Convert status codes to display text and UI5 ValueStates
 * 
 * Decision Status Values:
 * - PENDING: Awaiting decision
 * - REVIEW: Under review
 * - APPROVED: Approved
 * - DECLINED: Declined
 * - APPROVED_CLOSED: Approved and closed
 * - DECLINED_CLOSED: Declined and closed
 * - CANCELLED: Cancelled
 * 
 * API Endpoint Used:
 * - POST /api/get-approval-status
 * 
 * @file ApprovalService.js
 * @module com/tns/fsm/timematerialext/app/utils/services/ApprovalService
 */
sap.ui.define([], () => {
    "use strict";

    return {
        /**
         * Cache for approval data (status + decision remarks).
         * @type {Map<string, {status: string, remarks: string|null}|null>}
         * @private
         */
        _approvalCache: new Map(),

        /**
         * Fetch approval statuses for multiple T&M entry IDs.
         * Uses cache to avoid redundant API calls.
         * @param {string[]} objectIds - Array of T&M entry IDs
         * @returns {Promise<Object>} Map of objectId to decisionStatus
         */
        async fetchApprovalStatuses(objectIds) {
            if (!objectIds || objectIds.length === 0) {
                return {};
            }

            // Filter out IDs we already have cached
            const uncachedIds = objectIds.filter(id => !this._approvalCache.has(id));

            if (uncachedIds.length > 0) {
                try {
                    const response = await fetch("/api/v1/get-approval-status", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ objectIds: uncachedIds })
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to fetch approval statuses: ${response.status}`);
                    }

                    const data = await response.json();
                    const statuses = data.statuses || {};

                    // Cache the results (handle both object and string formats)
                    Object.keys(statuses).forEach(id => {
                        const entry = statuses[id];
                        if (typeof entry === 'object' && entry !== null) {
                            this._approvalCache.set(id, {
                                status: entry.decisionStatus || null,
                                remarks: entry.decisionRemarks || null
                            });
                        } else {
                            // Backward compatibility: plain string
                            this._approvalCache.set(id, {
                                status: entry,
                                remarks: null
                            });
                        }
                    });

                    // Also cache null for IDs that had no approval record
                    uncachedIds.forEach(id => {
                        if (!this._approvalCache.has(id)) {
                            this._approvalCache.set(id, null);
                        }
                    });

                } catch (error) {
                    console.error("ApprovalService: Error fetching statuses:", error);
                    // Cache null for failed lookups to avoid repeated requests
                    uncachedIds.forEach(id => {
                        if (!this._approvalCache.has(id)) {
                            this._approvalCache.set(id, null);
                        }
                    });
                }
            }

            // Return all requested statuses from cache
            const result = {};
            objectIds.forEach(id => {
                const cached = this._approvalCache.get(id);
                result[id] = cached ? cached.status : null;
            });
            return result;
        },

        /**
         * Get approval status for a single T&M entry ID from cache.
         * @param {string} objectId - T&M entry ID
         * @returns {string|null} Decision status or null if not found
         */
        getStatusById(objectId) {
            const cached = this._approvalCache.get(objectId);
            return cached ? cached.status : null;
        },

        /**
         * Get approval decision remarks for a single T&M entry ID from cache.
         * @param {string} objectId - T&M entry ID
         * @returns {string|null} Decision remarks or null if not found
         */
        getRemarksById(objectId) {
            const cached = this._approvalCache.get(objectId);
            return cached ? cached.remarks : null;
        },

        /**
         * Get human-readable display text for decision status.
         * @param {string} status - Decision status code
         * @returns {string} Human-readable status text
         */
        getStatusDisplayText(status) {
            if (!status) {
                return 'N/A';
            }

            const statusTexts = {
                'PENDING': 'Pending',
                'REVIEW': 'Under Review',
                'APPROVED': 'Approved',
                'DECLINED': 'Declined',
                'APPROVED_CLOSED': 'Approved (Closed)',
                'DECLINED_CLOSED': 'Declined (Closed)',
                'CANCELLED': 'Cancelled'
            };

            return statusTexts[status] || status;
        },

        /**
         * Get UI5 ValueState for decision status (for styling).
         * @param {string} status - Decision status code
         * @returns {string} UI5 ValueState (None, Success, Warning, Error, Information)
         */
        getStatusState(status) {
            if (!status) {
                return 'None';
            }

            const stateMap = {
                'PENDING': 'Warning',
                'REVIEW': 'Information',
                'APPROVED': 'Success',
                'DECLINED': 'Error',
                'APPROVED_CLOSED': 'Success',
                'DECLINED_CLOSED': 'Error',
                'CANCELLED': 'None'
            };

            return stateMap[status] || 'None';
        },

        /**
         * Preload approval statuses for an array of T&M reports.
         * @param {Array} reports - Array of T&M report objects with 'id' property
         * @returns {Promise<void>}
         */
        async preloadStatusesForReports(reports) {
            if (!reports || reports.length === 0) {
                return;
            }

            const objectIds = reports.map(report => report.id).filter(id => id);
            await this.fetchApprovalStatuses(objectIds);
        },

        /**
         * Refresh status for a single entry (bypasses cache).
         * Used when opening an entry for edit to get fresh status.
         * @param {string} objectId - T&M entry ID
         * @returns {Promise<string|null>} Fresh decision status
         */
        async refreshStatusForEntry(objectId) {
            if (!objectId) {
                return null;
            }

            // Remove from cache to force fresh fetch
            this._approvalCache.delete(objectId);

            try {
                const response = await fetch("/api/v1/get-approval-status", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ objectIds: [objectId] })
                });

                if (!response.ok) {
                    throw new Error(`Failed to refresh approval status: ${response.status}`);
                }

                const data = await response.json();
                const entry = data.statuses?.[objectId] || null;

                // Update cache with fresh value
                if (entry && typeof entry === 'object') {
                    this._approvalCache.set(objectId, {
                        status: entry.decisionStatus || null,
                        remarks: entry.decisionRemarks || null
                    });
                    return entry.decisionStatus || null;
                } else {
                    this._approvalCache.set(objectId, entry ? { status: entry, remarks: null } : null);
                    return entry || null;
                }

            } catch (error) {
                console.error("ApprovalService: Error refreshing status for", objectId, ":", error);
                return null;
            }
        },

        /**
         * Clear the approval cache.
         */
        clearCache() {
            this._approvalCache.clear();
        }
    };
});