/**
 * URLHelper.js
 * 
 * Frontend utility for URL parameter handling and context resolution.
 * Works together with ContextService for unified context handling.
 * 
 * Supports three context sources:
 * 1. URL parameters: ?activityId=xxx or ?serviceCallId=xxx
 * 2. FSM Mobile Web Container: POST to /web-container-access-point
 * 3. FSM Web UI Shell: fsm-shell SDK communication
 * 
 * @file URLHelper.js
 * @module com/tng/fsm/timematerialext/app/utils/helpers/URLHelper
 */
sap.ui.define([
    "com/tng/fsm/timematerialext/app/utils/services/ContextService"
], (ContextService) => {
    "use strict";

    /**
     * Object types supported by the app
     */
    const OBJECT_TYPES = {
        ACTIVITY: 'ACTIVITY',
        SERVICECALL: 'SERVICECALL'
    };

    /**
     * Cached web container context.
     * @type {Object|null}
     * @private
     */
    let _webContainerContext = null;
    
    /**
     * Flag indicating if context has been checked.
     * @type {boolean}
     * @private
     */
    let _webContainerChecked = false;

    return {
        /**
         * Supported object types
         */
        OBJECT_TYPES,

        /**
         * Get URL parameters as object.
         * @returns {{activityId: string|null, serviceCallId: string|null, activityCode: string|null, activitySubject: string|null}}
         */
        getUrlParameters() {
            const urlParams = new URLSearchParams(window.location.search);
            return {
                activityId: urlParams.get('activityId'),
                serviceCallId: urlParams.get('serviceCallId'),
                activityCode: urlParams.get('activityCode'),
                activitySubject: urlParams.get('activitySubject')
            };
        },

        /**
         * Check if activity ID exists in URL.
         * @returns {boolean}
         */
        hasActivityId() {
            return !!this.getUrlParameters().activityId;
        },

        /**
         * Check if service call ID exists in URL.
         * @returns {boolean}
         */
        hasServiceCallId() {
            return !!this.getUrlParameters().serviceCallId;
        },

        /**
         * Get activity ID from URL.
         * @returns {string|null}
         */
        getActivityId() {
            return this.getUrlParameters().activityId;
        },

        /**
         * Get service call ID from URL.
         * @returns {string|null}
         */
        getServiceCallId() {
            return this.getUrlParameters().serviceCallId;
        },

        /**
         * Fetch web container context from server.
         * Called when app is opened from FSM Mobile web container.
         * @returns {Promise<Object|null>} Context object or null
         */
        async fetchWebContainerContext() {
            if (_webContainerChecked) {
                return _webContainerContext;
            }

            try {
                const response = await fetch('/web-container-context', {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    _webContainerChecked = true;
                    _webContainerContext = null;
                    return null;
                }

                _webContainerContext = await response.json();
                _webContainerChecked = true;

                return _webContainerContext;

            } catch (error) {
                console.error('URLHelper: Error fetching web container context:', error);
                _webContainerChecked = true;
                _webContainerContext = null;
                return null;
            }
        },

        /**
         * Get the context info - determines object type and ID.
         * Uses ContextService for unified context handling across Mobile/Shell/URL.
         * @returns {Promise<{objectType: string, objectId: string, source: string}|null>} Context info or null
         */
        async getContextInfo() {
            try {
                // Use ContextService for unified context handling
                const context = await ContextService.getContext();
                
                if (context && context.objectId) {
                    // Also update local cache for backward compatibility
                    if (context.source === 'mobile') {
                        _webContainerContext = {
                            cloudId: context.objectId,
                            objectType: context.objectType,
                            userName: context.userName,
                            companyName: context.companyName
                        };
                        _webContainerChecked = true;
                    }
                    
                    return {
                        objectType: context.objectType,
                        objectId: context.objectId,
                        source: context.source,
                        // Additional context data
                        activityId: context.activityId,
                        serviceCallId: context.serviceCallId,
                        userName: context.userName,
                        companyName: context.companyName,
                        cloudHost: context.cloudHost
                    };
                }
                
                return null;
            } catch (error) {
                console.error('URLHelper: Error getting context info:', error);
                return null;
            }
        },

        /**
         * Get activity ID from any source (URL params, web container, or Shell).
         * @returns {Promise<string|null>} Activity ID or null
         */
        async getActivityIdAsync() {
            const context = await this.getContextInfo();
            
            if (context) {
                if (context.objectType === OBJECT_TYPES.ACTIVITY) {
                    return context.objectId;
                }
                if (context.activityId) {
                    return context.activityId;
                }
            }
            
            return null;
        },

        /**
         * Get full web container context (cached).
         * @returns {Object|null}
         */
        getWebContainerContext() {
            return _webContainerContext;
        },

        /**
         * Set web container context (used when context is fetched elsewhere).
         * @param {Object} context - Web container context object
         */
        setWebContainerContext(context) {
            _webContainerContext = context;
            _webContainerChecked = true;
        },

        /**
         * Clear cached web container context.
         */
        clearWebContainerContext() {
            _webContainerContext = null;
            _webContainerChecked = false;
            ContextService.clearCache();
        },

        /**
         * Check if running in FSM Shell (Web UI)
         * @returns {boolean}
         */
        isInShell() {
            return ContextService.isInShell();
        },

        /**
         * Check if running in FSM Mobile
         * @returns {boolean}
         */
        isInMobile() {
            return ContextService.isInMobile();
        }
    };
});