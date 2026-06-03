/**
 * ContextService.js
 * 
 * Universal context provider for SAP FSM integration.
 * Handles context acquisition from multiple environments:
 * 
 * 1. FSM Mobile Web Container (POST to /web-container-access-point)
 * 2. FSM Web UI Shell (fsm-shell SDK)
 * 3. URL Parameters (standalone/development)
 * 
 * The service automatically detects the environment and provides
 * a unified context object with activity/service call information.
 * 
 * Usage:
 *   ContextService.getContext().then(context => {
 *       console.log(context.source);     // 'mobile', 'shell', or 'url'
 *       console.log(context.activityId); // Activity ID from any source
 *   });
 * 
 * @file ContextService.js
 * @module com/tns/fsm/timematerialext/app/utils/services/ContextService
 */
sap.ui.define([], function () {
    "use strict";

    /**
     * Shell SDK instance (loaded dynamically for Web UI)
     * @private
     */
    let _shellSdk = null;

    /**
     * Cached context
     * @private
     */
    let _cachedContext = null;

    /**
     * Shell SDK loaded flag
     * @private
     */
    let _shellSdkLoaded = false;

    /**
     * Object types supported
     */
    const OBJECT_TYPES = {
        ACTIVITY: 'ACTIVITY',
        SERVICECALL: 'SERVICECALL'
    };

    /**
     * Context sources
     */
    const CONTEXT_SOURCES = {
        MOBILE: 'mobile',      // FSM Mobile Web Container (via backend)
        SHELL: 'shell',        // FSM Web UI Shell
        URL: 'url'             // URL parameters
    };

    return {
        OBJECT_TYPES: OBJECT_TYPES,
        CONTEXT_SOURCES: CONTEXT_SOURCES,

        /**
         * Get context from the current environment.
         * Automatically detects Mobile Web Container, FSM Shell, or URL params.
         * 
         * @returns {Promise<Object>} Context object with:
         *   - source: 'mobile' | 'shell' | 'url'
         *   - objectType: 'ACTIVITY' | 'SERVICECALL' | null
         *   - objectId: Activity/ServiceCall ID
         *   - activityId: Activity ID (if applicable)
         *   - serviceCallId: ServiceCall ID (if applicable)
         *   - userId: User ID
         *   - companyId: Company ID
         *   - accountId: Account ID
         *   - cloudHost: FSM cloud host URL
         *   - userName: User name
         */
        getContext: function () {
            return new Promise((resolve, reject) => {
                // Return cached context if available
                if (_cachedContext) {
                    console.log("ContextService: Returning cached context from", _cachedContext.source);
                    resolve(_cachedContext);
                    return;
                }

                // Detection chain
                this._detectAndGetContext()
                    .then((context) => {
                        _cachedContext = context;
                        console.log("ContextService: Context resolved from", context.source, context);
                        resolve(context);
                    })
                    .catch((error) => {
                        console.error("ContextService: Failed to get context", error);
                        reject(error);
                    });
            });
        },

        /**
         * Detect environment and get context
         * @private
         */
        _detectAndGetContext: async function () {
            // Priority 1: URL parameters (for development/testing)
            const urlContext = this._getURLContext();
            if (urlContext.objectId) {
                console.log("ContextService: URL parameters detected");
                return urlContext;
            }

            // Priority 2: FSM Shell (Web UI) - check FIRST if in iframe
            // This is important because backend may have stale mobile context
            if (this._isInIframe()) {
                console.log("ContextService: Running in iframe, trying Shell SDK first...");
                try {
                    const shellContext = await this._getShellContext();
                    if (shellContext && (shellContext.objectId || shellContext.userId)) {
                        console.log("ContextService: FSM Shell context detected");

                        // OPTION B: establish a backend session before returning context.
                        // Without this, all /api/v1/* calls would 401 (strict auth, no carve-out).
                        // The Shell SDK's access_token is a real FSM-signed JWT; the backend
                        // verifies it and sets an HttpOnly session cookie.
                        if (shellContext.authToken) {
                            try {
                                await this._initializeShellSession(shellContext.authToken);
                                console.log("ContextService: Shell session initialized — cookie set");
                            } catch (err) {
                                console.error("ContextService: Shell session init failed:", err);
                                // Fall through — the app will load but /api/v1/* calls will 401.
                                // This makes the failure mode visible (errors in the UI) rather
                                // than silently returning context that can't be used.
                            }
                        } else {
                            console.warn("ContextService: Shell context has no authToken — " +
                                "/api/v1/* calls will not be authenticated");
                        }

                        return shellContext;
                    }
                } catch (e) {
                    console.log("ContextService: Shell context not available:", e.message);
                    // Fall through to mobile context
                }
            }

            // Priority 3: Backend web-container-context (FSM Mobile POST was received)
            // Only use this if NOT in iframe (direct browser access after mobile POST)
            if (!this._isInIframe()) {
                try {
                    const mobileContext = await this._getMobileContext();
                    if (mobileContext && mobileContext.objectId) {
                        console.log("ContextService: Mobile web container context detected");
                        return mobileContext;
                    }
                } catch (e) {
                    console.log("ContextService: No mobile context available");
                }
            }

            // No context found - return empty context
            console.log("ContextService: No context found - standalone mode");
            return {
                source: CONTEXT_SOURCES.URL,
                objectType: null,
                objectId: null,
                activityId: null,
                serviceCallId: null
            };
        },

        /**
         * Check if app is running in an iframe
         * @private
         */
        _isInIframe: function () {
            try {
                return window.self !== window.top;
            } catch (e) {
                return true; // If we can't access top, we're in iframe
            }
        },

        /**
        * Establish a backend session for the Web UI Shell flow.
        * 
        * POSTs the Shell SDK's access_token to /api/v1/shell-session-init.
        * The backend verifies the JWT against FSM's JWKS and returns a
        * session token. We store the token on window.__fsmSessionToken so
        * the global fetch wrapper in Component.js can attach it as an
        * Authorization: Bearer header on subsequent /api/v1/* requests.
        * 
        * Why a Bearer header instead of just relying on the cookie:
        * The FSM Web UI loads our app in a cross-site iframe. Modern
        * browsers (Edge, Chrome, Safari) refuse to store third-party
        * cookies even with SameSite=None; Secure set. The cookie's
        * Set-Cookie response header is silently dropped by the browser.
        * The Authorization header is the reliable mechanism for this
        * context. The Mobile WebView flow continues to use cookies because
        * the WebView is a first-party browsing context.
        * 
        * @param {string} authToken - The FSM JWT (access_token) from Shell SDK
        * @returns {Promise<Object>} The session info returned by the backend
        * @throws {Error} If the backend rejects the token or the request fails
        * @private
        */
        _initializeShellSession: async function (authToken) {
            const response = await fetch('/api/v1/shell-session-init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authToken: authToken })
            });

            if (!response.ok) {
                let detail = '';
                try {
                    const errBody = await response.json();
                    detail = errBody.message || JSON.stringify(errBody);
                } catch (e) {
                    detail = await response.text();
                }
                throw new Error(`Shell session init failed (${response.status}): ${detail}`);
            }

            const result = await response.json();

            // Store the session token globally so the fetch wrapper in
            // Component.js can attach it as Authorization: Bearer on
            // subsequent /api/v1/* requests. Required because the cookie
            // path is unreliable in the third-party iframe context.
            if (result && result.sessionToken && typeof window !== 'undefined') {
                window.__fsmSessionToken = result.sessionToken;
                console.log("ContextService: Session token stored for Bearer auth (Web UI flow)");
            } else {
                console.warn("ContextService: shell-session-init returned no sessionToken — " +
                    "/api/v1/* calls will rely on cookie (likely to fail in iframe)");
            }

            return result;
        },

        /**
         * Get context from URL parameters
         * @private
         */
        _getURLContext: function () {
            const urlParams = new URLSearchParams(window.location.search);
            const activityId = urlParams.get('activityId');
            const serviceCallId = urlParams.get('serviceCallId');

            if (activityId) {
                return {
                    source: CONTEXT_SOURCES.URL,
                    objectType: OBJECT_TYPES.ACTIVITY,
                    objectId: activityId,
                    activityId: activityId,
                    serviceCallId: null
                };
            }

            if (serviceCallId) {
                return {
                    source: CONTEXT_SOURCES.URL,
                    objectType: OBJECT_TYPES.SERVICECALL,
                    objectId: serviceCallId,
                    activityId: null,
                    serviceCallId: serviceCallId
                };
            }

            return {
                source: CONTEXT_SOURCES.URL,
                objectType: null,
                objectId: null
            };
        },

        /**
         * Get context from backend (web-container-context endpoint).
         * The contextKey is injected into the URL by the server redirect after POST,
         * e.g. /?contextKey=userName_cloudId — we read it here and pass it to GET.
         * @private
         */
        _getMobileContext: async function () {
            // Read the key the server embedded in the redirect URL
            const urlParams = new URLSearchParams(window.location.search);
            const contextKey = urlParams.get('contextKey');

            if (!contextKey) {
                // No key in URL — not coming from a mobile web container redirect
                return null;
            }

            const response = await fetch(`/web-container-context?key=${encodeURIComponent(contextKey)}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            if (!data || !data.cloudId) {
                return null;
            }

            const objectType = (data.objectType || '').toUpperCase();

            return {
                source: CONTEXT_SOURCES.MOBILE,
                objectType: objectType === 'ACTIVITY' ? OBJECT_TYPES.ACTIVITY :
                    objectType === 'SERVICECALL' ? OBJECT_TYPES.SERVICECALL : null,
                objectId: data.cloudId,
                activityId: objectType === 'ACTIVITY' ? data.cloudId : null,
                serviceCallId: objectType === 'SERVICECALL' ? data.cloudId : null,
                userName: data.userName,
                companyName: data.companyName,
                cloudAccount: data.cloudAccount,
                language: data.language
            };
        },

        /**
         * Get context from FSM Shell (Web UI)
         * Uses fsm-shell SDK to communicate with FSM Shell host
         * @private
         */
        _getShellContext: function () {
            return new Promise((resolve, reject) => {
                // Load Shell SDK dynamically
                this._loadShellSdk()
                    .then(() => {
                        this._requestShellContext(resolve, reject);
                    })
                    .catch((error) => {
                        reject(error);
                    });
            });
        },

        /**
         * Load FSM Shell SDK dynamically
         * @private
         */
        _loadShellSdk: function () {
            return new Promise((resolve, reject) => {
                if (_shellSdkLoaded && window.FSMShell) {
                    resolve();
                    return;
                }

                // Check if already loaded
                if (window.FSMShell) {
                    _shellSdkLoaded = true;
                    resolve();
                    return;
                }

                // Load script dynamically
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/fsm-shell@1.20.0/release/fsm-shell-client.js';
                script.async = true;

                script.onload = () => {
                    _shellSdkLoaded = true;
                    console.log("ContextService: FSM Shell SDK loaded");
                    resolve();
                };

                script.onerror = () => {
                    reject(new Error("Failed to load FSM Shell SDK"));
                };

                document.head.appendChild(script);

                // Timeout after 5 seconds
                setTimeout(() => {
                    if (!_shellSdkLoaded) {
                        reject(new Error("FSM Shell SDK load timeout"));
                    }
                }, 5000);
            });
        },

        /**
         * Request context from FSM Shell.
         *
         * FSM Shell delivers the full context in a single REQUIRE_CONTEXT response,
         * including the current ViewState (selected activity / service call). One
         * event, one response — no separate ViewState messages on initial load.
         *
         * Note on onViewState: those listeners fire only on user-initiated ViewState
         * changes after initial load, which this extension doesn't react to (a
         * navigation triggers a new page load, not a live update). If that ever
         * changes, register listeners after REQUIRE_CONTEXT has resolved.
         *
         * @private
         */
        _requestShellContext: function (resolve, reject) {
            try {
                const { ShellSdk, SHELL_EVENTS } = window.FSMShell;
                _shellSdk = ShellSdk.init(parent, '*');

                const timeout = setTimeout(() => {
                    reject(new Error("Shell context request timeout"));
                }, 5000);

                const shellContext = {
                    source: CONTEXT_SOURCES.SHELL,
                    objectType: null,
                    objectId: null,
                    activityId: null,
                    serviceCallId: null
                };

                _shellSdk.on(SHELL_EVENTS.Version1.REQUIRE_CONTEXT, (event) => {
                    const data = JSON.parse(event);
                    console.log("ContextService: Raw shell context received:", data);

                    // Basic user / company / account info
                    shellContext.userId = data.userId;
                    shellContext.userName = data.user;
                    shellContext.companyId = data.companyId;
                    shellContext.companyName = data.company;
                    shellContext.accountId = data.accountId;
                    shellContext.accountName = data.account;
                    shellContext.cloudHost = data.cloudHost;
                    shellContext.locale = data.selectedLocale;
                    shellContext.authToken = data.auth?.access_token || null;

                    // Useful FSM metadata for diagnostics and UX
                    shellContext.outletName = data.outlet?.name || null;
                    shellContext.deploymentId = data.extension?.deploymentId || null;
                    shellContext.themeId = data.selectedThemeId || null;

                    // Keep the raw payload for advanced consumers
                    shellContext._rawShellContext = data;

                    // ViewState comes embedded in the REQUIRE_CONTEXT response
                    if (data.viewState) {
                        this._extractFromViewState(data.viewState, shellContext);
                    }

                    clearTimeout(timeout);
                    resolve(shellContext);
                });

                _shellSdk.emit(SHELL_EVENTS.Version1.REQUIRE_CONTEXT, {
                    clientIdentifier: 'tm-reporting-extension',
                    auth: { response_type: 'token' }
                });

            } catch (e) {
                reject(new Error("Shell SDK init failed: " + e.message));
            }
        },

        /**
         * Extract activityId / serviceCallId from the ViewState payload.
         *
         * Observed ViewState shape in FSM Web UI (Service Call Activity outlet):
         *   {
         *     activityID,                  primary key — capital ID
         *     selectedActivityId,          duplicate of activityID
         *     selectedServiceCallId,       service call key
         *     selectedBusinessPartnerId,
         *     selectedSidebar: { eventId, id: "ACTIVITY:<uuid>" },
         *     simulationData: { ... }
         *   }
         *
         * @private
         */
        _extractFromViewState: function (viewState, shellContext) {
            console.log("ContextService: Extracting from ViewState:", viewState);

            // activityID is primary; selectedActivityId is a duplicate fallback
            const activityId = viewState.activityID || viewState.selectedActivityId;
            const serviceCallId = viewState.selectedServiceCallId;

            if (activityId) {
                console.log("ContextService: Found activityId:", activityId);
                shellContext.activityId = activityId;
                shellContext.objectId = activityId;
                shellContext.objectType = OBJECT_TYPES.ACTIVITY;
            }

            if (serviceCallId) {
                console.log("ContextService: Found serviceCallId:", serviceCallId);
                shellContext.serviceCallId = serviceCallId;
                // Only promote to primary object if no activity was selected
                if (!shellContext.activityId) {
                    shellContext.objectId = serviceCallId;
                    shellContext.objectType = OBJECT_TYPES.SERVICECALL;
                }
            }
        },

        /**
         * Get the Shell SDK instance (for advanced usage)
         * @returns {Object|null} ShellSdk instance or null
         */
        getShellSdk: function () {
            return _shellSdk;
        },

        /**
         * Check if running in FSM Shell (Web UI)
         * @returns {boolean}
         */
        isInShell: function () {
            return _cachedContext && _cachedContext.source === CONTEXT_SOURCES.SHELL;
        },

        /**
         * Check if running in FSM Mobile Web Container
         * @returns {boolean}
         */
        isInMobile: function () {
            return _cachedContext && _cachedContext.source === CONTEXT_SOURCES.MOBILE;
        },

        /**
         * Clear cached context (for testing/reset)
         */
        clearCache: function () {
            _cachedContext = null;
        }
    };
});