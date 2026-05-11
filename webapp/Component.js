// ===========================================================================
// GLOBAL FETCH WRAPPER — INCLUDE COOKIES + INJECT BEARER TOKEN
// ===========================================================================
// All /api/v1/* calls require authentication. Two delivery mechanisms:
//
//   - HttpOnly session cookie (Mobile flow — WebView stores it fine).
//     The browser attaches the cookie automatically; no code needed here.
//
//   - Authorization: Bearer header (Web UI flow — third-party iframe context
//     where browsers refuse to store cookies). ContextService stores the
//     token on window.__fsmSessionToken after shell-session-init succeeds;
//     this wrapper attaches it to every /api/v1/* request.
//
// Sending both is harmless — the backend uses whichever is valid.
//
// NOTE: Bootstrap sequencing in View1.controller.js _initializeAsync()
// ensures /api/v1/* fetches don't fire until session is established.
// No request gating is needed here.
// ===========================================================================
(function wrapFetchToIncludeCookies() {
    if (typeof window === 'undefined' || !window.fetch) return;
    if (window.__fetchWrappedForCookies) return;
    window.__fetchWrappedForCookies = true;

    // Slot for the session token (Web UI flow). Mobile flow leaves this null.
    // ContextService writes here after shell-session-init succeeds.
    window.__fsmSessionToken = null;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async function(input, init) {
        const opts = init || {};
        if (!opts.credentials) {
            opts.credentials = 'include';
        }

        const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
        const isApi = urlStr.indexOf('/api/') === 0;
        const isInitEndpoint = urlStr.indexOf('/api/v1/shell-session-init') === 0;

        // Inject Authorization header if we have a Bearer token (Web UI flow).
        // Skip the init endpoint — it doesn't need auth (it's establishing it).
        if (isApi && !isInitEndpoint && window.__fsmSessionToken) {
            const headers = new Headers(opts.headers || {});
            if (!headers.has('Authorization')) {
                headers.set('Authorization', 'Bearer ' + window.__fsmSessionToken);
                opts.headers = headers;
            }
        }

        return originalFetch(input, opts);
    };
})();

/**
 * Component.js
 */
sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/tng/fsm/timematerialext/app/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("com.tng.fsm.timematerialext.app.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            UIComponent.prototype.init.apply(this, arguments);
            this.setModel(models.createDeviceModel(), "device");

            const router = this.getRouter();

            if (router) {
                router.attachBypassed(() => {
                    router.navTo("RouteTimeMaterialExt", {}, true);
                });

                router.initialize();

                setTimeout(() => {
                    const targets = router.getTargets();
                    if (targets) {
                        const tmExtTarget = targets.getTarget("TargetTimeMaterialExt");
                        if (tmExtTarget && !tmExtTarget._oView) {
                            router.navTo("RouteTimeMaterialExt", {}, true);
                        }
                    }
                }, 500);
            }
        }
    });
});