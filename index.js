/**
 * index.js - Backend Server
 * 
 * Express.js server for the Service Confirmation application.
 * 
 * Security model (post-Option-B — full inbound auth on all paths):
 * 
 * 1. FSM Mobile WebContainer path:
 *    - POST /web-container-access-point validated by Authentication Key.
 *    - Successful validation issues an HttpOnly session cookie.
 *    - All /api/v1/* calls require this cookie.
 * 
 * 2. FSM Web UI Shell extension path:
 *    - GET / loads the iframe (no auth at this stage — it's just static HTML).
 *    - Frontend's ContextService POSTs the FSM access_token JWT to
 *      /api/v1/shell-session-init.
 *    - Backend verifies the JWT signature against FSM's JWKS endpoint and
 *      issues an HttpOnly session cookie on success.
 *    - All subsequent /api/v1/* calls require this cookie.
 * 
 * 3. Standalone URL flow (?activityId=...):
 *    - No session source available; /api/v1/* calls will 401.
 *    - Standalone is now a development-only mode that requires a separate
 *      auth path. Use FSM Mobile or Web UI for normal access.
 * 
 * @file index.js
 * @requires express, cookie-parser, jsonwebtoken (via FSMJwtValidator)
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const { validateJwt } = require('./utils/FSMJwtValidator');

const app = express();

// ===========================
// AUTHENTICATION KEY (SHARED SECRET WITH FSM)
// ===========================

const FSM_WEBCONTAINER_AUTH_KEY = process.env.FSM_WEBCONTAINER_AUTH_KEY;

if (!FSM_WEBCONTAINER_AUTH_KEY) {
    console.error('FATAL: FSM_WEBCONTAINER_AUTH_KEY environment variable is not set.');
    console.error('       Set it via: cf set-env tns-fsm-timematerialext-ui-dev FSM_WEBCONTAINER_AUTH_KEY <value>');
    process.exit(1);
}

if (FSM_WEBCONTAINER_AUTH_KEY.length < 16) {
    console.warn('WARNING: FSM_WEBCONTAINER_AUTH_KEY is shorter than 16 characters.');
}

function isAuthKeyValid(body) {
    const provided = body && body.authenticationKey;
    if (typeof provided !== 'string' || provided.length === 0) {
        return false;
    }
    const providedBuf = Buffer.from(provided, 'utf8');
    const expectedBuf = Buffer.from(FSM_WEBCONTAINER_AUTH_KEY, 'utf8');
    if (providedBuf.length !== expectedBuf.length) {
        return false;
    }
    return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

// ===========================
// SESSION & CONTEXT STORES
// ===========================

const SESSION_TTL_MS = 60 * 60 * 1000;
const CONTEXT_TTL_MS = 60 * 60 * 1000;

const contextStore = new Map();
const sessionStore = new Map();

const SESSION_COOKIE_NAME = 'fsm_session';

function buildContextKey(body) {
    const userName = (body.userName || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cloudId  = (body.cloudId  || 'unknown'  ).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${userName}_${cloudId}`;
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function evictExpired() {
    const now = Date.now();
    for (const [key, entry] of contextStore.entries()) {
        if (now - entry.timestamp > CONTEXT_TTL_MS) {
            contextStore.delete(key);
        }
    }
    for (const [token, entry] of sessionStore.entries()) {
        if (now > entry.expiresAt) {
            sessionStore.delete(token);
        }
    }
}

function resolveSession(token) {
    if (!token || typeof token !== 'string') return null;
    const entry = sessionStore.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        sessionStore.delete(token);
        return null;
    }
    return entry.contextKey;
}

/**
 * Cookie attributes used for the Mobile WebContainer flow's session cookie.
 * 
 * SameSite=None is REQUIRED for the Web UI Shell iframe flow (cross-site
 * iframe context). For the Mobile WebView flow, the WebView is a top-level
 * browsing context — SameSite=None is harmless there.
 * 
 * Secure must be true when SameSite=None (browser requirement).
 */
const SESSION_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: true,
    sameSite: 'none',  // changed from 'lax' in Option B — required for cross-site iframe
    path: '/',
    maxAge: SESSION_TTL_MS
};

function requireSession(req, res, next) {
    // Accept session token from EITHER:
    //   1. fsm_session cookie (Mobile flow — WebView stores cookies fine)
    //   2. Authorization: Bearer <token> header (Web UI flow — third-party
    //      iframe context where browsers refuse to store cookies even with
    //      SameSite=None; Secure set)
    //
    // Both mechanisms point to the same sessionStore. Either source counts.
    let token = null;
    let source = null;

    const cookieToken = req.cookies && req.cookies[SESSION_COOKIE_NAME];
    if (cookieToken) {
        token = cookieToken;
        source = 'cookie';
    } else {
        const authHeader = req.get('authorization') || '';
        if (authHeader.toLowerCase().startsWith('bearer ')) {
            token = authHeader.substring(7).trim();
            source = 'bearer';
        }
    }

    const contextKey = resolveSession(token);

    if (!contextKey) {
        const reason = !token ? 'missing-credential' : 'invalid-or-expired';
        console.warn(`AUTH: rejected ${req.method} ${req.originalUrl} — session ${reason} ` +
                     `(remoteIp=${req.ip}, source=${source || 'none'})`);
        return res.status(401).json({
            message: 'Unauthorized: missing or expired session.',
            hint: 'This endpoint requires a valid session, supplied either via fsm_session ' +
                  'cookie (Mobile flow) or Authorization: Bearer header (Web UI flow).'
        });
    }

    // Sliding session: extend the expiration on every authenticated request.
    // Active users effectively never expire; only sessions truly idle for
    // SESSION_TTL_MS get expired by resolveSession() on next access.
    const entry = sessionStore.get(token);
    entry.expiresAt = Date.now() + SESSION_TTL_MS;

    // Also extend the underlying context entry so it doesn't get evicted
    // while its session is still active.
    const contextEntry = contextStore.get(contextKey);
    if (contextEntry) {
        contextEntry.timestamp = Date.now();
    }

    // Refresh the cookie's Max-Age too — otherwise the browser-side expiry
    // hits at the original time even though the server-side has been extended.
    // Skipped for Bearer flow: the browser ignores Set-Cookie in third-party
    // iframe context anyway, and the Bearer token uses server-side expiresAt.
    if (source === 'cookie') {
        res.cookie(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
    }

    req.fsmContextKey = contextKey;
    req.fsmAuthSource = source;
    next();
}

// ===========================
// MIDDLEWARE
// ===========================
app.use((req, res, next) => {
    res.removeHeader('X-Frame-Options');
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.enable('trust proxy');

// ===========================
// FSM MOBILE WEBCONTAINER ENTRY POINTS
// ===========================

function handleWebContainerPost(req, res, label) {
    const body = req.body || {};

    if (!isAuthKeyValid(body)) {
        const provided = body && body.authenticationKey;
        const reason = !provided
            ? 'missing'
            : (typeof provided !== 'string' ? 'wrong-type' : 'mismatch');
        console.warn(`${label}: rejected POST — authenticationKey ${reason} ` +
                     `(remoteIp=${req.ip}, userName=${body.userName || 'unknown'})`);
        return res.status(401).json({
            message: 'Unauthorized: invalid or missing authentication key.',
            hint: 'This endpoint can only be reached from FSM Mobile.'
        });
    }

    evictExpired();

    const { authenticationKey, ...storableBody } = body;
    const contextKey = buildContextKey(storableBody);
    contextStore.set(contextKey, { data: storableBody, timestamp: Date.now() });

    const sessionToken = generateSessionToken();
    sessionStore.set(sessionToken, {
        contextKey: contextKey,
        expiresAt: Date.now() + SESSION_TTL_MS
    });

    console.log(`${label}: context stored, session issued ` +
                `(contextKey=${contextKey}, contextStoreSize=${contextStore.size}, ` +
                `sessionStoreSize=${sessionStore.size})`);

    res.cookie(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS);

    const redirectUrl = `${req.protocol}://${req.get('host')}/?contextKey=${encodeURIComponent(contextKey)}`;
    res.redirect(redirectUrl);
}

app.post("/web-container-access-point", (req, res) => {
    handleWebContainerPost(req, res, 'WC-ACCESS-POINT');
});

app.post("/", (req, res) => {
    handleWebContainerPost(req, res, 'WC-ROOT');
});

// ===========================
// FSM WEB UI SHELL SESSION INIT
// ===========================
// Called by the frontend ContextService when Shell context is detected,
// passing the access_token JWT received from the FSM Shell SDK.
// We verify the JWT signature against FSM's public JWKS endpoint and
// issue a session cookie on success.
//
// MUST be registered BEFORE the requireSession middleware on /api/v1
// (otherwise the chicken-and-egg: this endpoint can't itself require a session).

app.post('/api/v1/shell-session-init', async (req, res) => {
    const token = req.body && req.body.authToken;

    if (!token) {
        console.warn(`SHELL-INIT: rejected — missing authToken in body (remoteIp=${req.ip})`);
        return res.status(400).json({
            message: 'Missing authToken in request body.',
            hint: 'Send { "authToken": "<jwt>" } where authToken is the access_token from the Shell SDK.'
        });
    }

    let payload;
    try {
        payload = await validateJwt(token);
    } catch (err) {
        console.warn(`SHELL-INIT: rejected — JWT validation failed: ${err.message} ` +
                     `(remoteIp=${req.ip})`);
        return res.status(401).json({
            message: 'Unauthorized: invalid FSM JWT.',
            hint: 'The authToken could not be verified. It may be expired, malformed, ' +
                  'or signed by an unrecognized key.'
        });
    }

    // Extract identity from the validated payload.
    // FSM JWT field names observed: user, user_name, user_email, account, account_id, companies[]
    const userName = payload.user || payload.user_name || 'shell-user';
    const cloudId = String(payload.account_id || payload.account || 'shell');

    evictExpired();

    const contextKey = buildContextKey({ userName: userName, cloudId: cloudId });

    // Store a context summary derived from the validated JWT.
    // We DO NOT store the JWT itself — once validated, it's done its job.
    const storableContext = {
        userName: userName,
        cloudId: cloudId,
        cloudAccount: payload.account,
        userEmail: payload.user_email,
        accountId: payload.account_id,
        userId: payload.user_id,
        source: 'shell',
        jwtJti: payload.jti,
        jwtExp: payload.exp
    };
    contextStore.set(contextKey, { data: storableContext, timestamp: Date.now() });

    const sessionToken = generateSessionToken();
    sessionStore.set(sessionToken, {
        contextKey: contextKey,
        expiresAt: Date.now() + SESSION_TTL_MS
    });

    console.log(`SHELL-INIT: session issued ` +
                `(contextKey=${contextKey}, userEmail=${payload.user_email || 'unknown'}, ` +
                `sessionStoreSize=${sessionStore.size})`);

    // We deliberately do NOT set a session cookie here.
    // The Shell flow runs in a cross-site iframe where browsers refuse to
    // store cookies regardless of SameSite=None; Secure. The session token
    // returned in the response body is captured by ContextService and sent
    // as Authorization: Bearer on subsequent requests. See docs/SECURITY.md.
    res.json({
        success: true,
        contextKey: contextKey,
        userName: userName,
        cloudAccount: payload.account,
        sessionToken: sessionToken,
        expiresIn: SESSION_TTL_MS
    });
});

// ===========================
// PROTECTED CONTEXT ENDPOINT (Mobile-only)
// ===========================

app.get("/web-container-context", requireSession, (req, res) => {
    const key = req.query.key;

    if (!key) {
        return res.status(400).json({
            message: 'Missing context key.'
        });
    }

    if (key !== req.fsmContextKey) {
        console.warn(`CONTEXT-FETCH: session ${req.fsmContextKey} attempted to read ${key}`);
        return res.status(403).json({
            message: 'Forbidden: session does not own this context.',
        });
    }

    const entry = contextStore.get(key);

    if (!entry) {
        return res.status(404).json({
            message: 'Context not found or expired.'
        });
    }

    return res.json(entry.data);
});

// ===========================
// STATIC FILES (UI5 FRONTEND)
// ===========================

app.use(express.static(path.join(__dirname, 'webapp')));

// ===========================
// API ROUTES — STRICT AUTH (no carve-out)
// ===========================
// All /api/v1/* routes require a valid session cookie.
// Cookie is issued either by:
//   - WebContainer POST (Mobile flow)
//   - /api/v1/shell-session-init (Web UI flow)
// 
// /api/v1/shell-session-init is registered ABOVE this middleware, so it
// can be called without a cookie (chicken-and-egg).

app.use('/api/v1', requireSession);

app.use('/api/v1', require('./routes/activityRoutes'));
app.use('/api/v1', require('./routes/entryRoutes'));
app.use('/api/v1', require('./routes/lookupRoutes'));
app.use('/api/v1', require('./routes/configRoutes'));

// ===========================
// START SERVER
// ===========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`FSM_WEBCONTAINER_AUTH_KEY is set (${FSM_WEBCONTAINER_AUTH_KEY.length} chars)`);
    console.log(`Session TTL: ${SESSION_TTL_MS / 60000} minutes`);
    console.log(`Cookie: HttpOnly; Secure; SameSite=None; Path=/`);
    console.log(`API mounted at /api/v1 (strict auth — no Web UI carve-out)`);
});