/**
 * FSMUdoService.js
 *
 * UDO (User Defined Object) retrieval for FSM API integration.
 *
 * These methods are mixed into the FSMService class prototype at startup
 * (see the Object.assign at the bottom of FSMService.js), so they have access
 * to FSMService's HTTP methods via `this` - notably `this.makeQueryRequest()`,
 * which already handles auth, account/company params and pagination.
 *
 * WHAT getUserSettings() RETURNS
 *
 *   definition - the UDO DEFINITION (UdoMeta): every field the UDO can hold,
 *                in the order FSM lists them, each with its label and - for
 *                SELECTIONLIST fields - its allowed options. This is what the
 *                first table in the dialog renders, and what a future PATCH
 *                will write against.
 *   records    - the UDO INSTANCES (UdoValue): the settings actually stored,
 *                one table each.
 *
 * THE THREE QUERIES
 *   1. SELECT w FROM UdoMeta  w WHERE w.name = 'TMExt_UserSettings'
 *        -> the definition, incl. its udfMetas[] (UUIDs)
 *   2. SELECT v FROM UdoValue v JOIN UdoMeta m ON v.meta = m
 *        WHERE m.name = 'TMExt_UserSettings'
 *        -> the stored records, each with udfValues[] = { meta: <UUID>, value }
 *   3. SELECT w FROM UdfMeta  w WHERE w.id IN (...)
 *        -> ONE query resolving every UUID from 1 and 2 together
 *
 * WHY THE META RESOLUTION HAPPENS HERE AND NOT IN THE BROWSER
 *   Resolving each UUID from the frontend would be one request per field (the
 *   N+1 pattern that caused the random PENDING bug in getApprovalStatusBatch -
 *   see the comment there). Queries 1-3 above are a fixed 3 requests no matter
 *   how many settings or records exist.
 *
 * NOTE ON selectionKeyValues
 *   FSM returns it as { "<code>": "<display text>" }, e.g.
 *       { "1": "Current date", "2": "Dispo date" }
 *   A write sends the CODE ("1"). Older records created by hand in FSM may hold
 *   the display text instead, so reads accept either: an option key is the code,
 *   and a stored value is translated to its text for display whichever form it
 *   is in (see buildOptions / resolveDisplayValue).
 *
 * Methods:
 * - getUdoMetaByName(udoMetaName)        - the UDO definition
 * - getUdoValuesByMetaName(udoMetaName)  - raw UdoValue rows
 * - getUdfMetaByIds(ids)                 - batch UUID -> UdfMeta resolution
 * - getUserSettings()                    - definition + records, display-ready
 * - saveUserSetting(...)                 - create or update one settings record
 *
 * @file utils/FSMUdoService.js
 * @module utils/FSMUdoService
 * @requires ./DestinationService (via FSMService `this` context)
 * @requires ./TokenCache (via FSMService `this` context)
 */

const axios = require('axios');
const DestinationService = require('./DestinationService');
const TokenCache = require('./TokenCache');

/**
 * Name of the FSM UDO holding the app's user settings.
 * Change here only - nothing else hardcodes it.
 * @type {string}
 */
const USER_SETTINGS_UDO_NAME = 'TMExt_UserSettings';

/** DTO version for the UDO definition query. @type {string} */
const UDO_META_DTOS = 'UdoMeta.10';

/** DTO versions for the UDO value query. @type {string} */
const UDO_VALUE_DTOS = 'UdoMeta.10;UdoValue.10';

/** DTO version for the UdfMeta resolution query. @type {string} */
const UDF_META_DTOS = 'UdfMeta.20';

/**
 * Max ids per IN() list. FSQL has no documented hard limit, but a very long
 * query string is a good way to find one, so the ids are chunked.
 * @type {number}
 */
const UDF_META_CHUNK_SIZE = 200;

/*
 * FIELD BEHAVIOUR - METADATA FIRST, CONFIG ONLY WHERE FSM CANNOT SAY
 *
 * Everything a field does comes from its own UdfMeta, so a setting added in FSM
 * tomorrow renders correctly with no code change:
 *
 *   description          -> the label in the Setting column
 *   selectionKeyValues   -> the dropdown options
 *   defaultValue         -> which option is preselected
 *   referencedObjectType -> what the field points at (e.g. PERSON)
 *
 * KNOWN_FIELD_CONFIG below covers the two cases FSM's metadata cannot express
 * for the fields that are always present. It is keyed by the UDF's externalId
 * and is STRICTLY ADDITIVE:
 *
 *   - a field with no entry here still renders from its own metadata; it simply
 *     gets no app-supplied default and no auto-fill. Nothing breaks.
 *   - an entry whose key matches no field is inert, and logged as a warning at
 *     startup of each request so a rename in FSM is noticed rather than silently
 *     dropping a default.
 *   - FSM's own defaultValue always wins over the default configured here, so
 *     setting it in FSM Admin later takes over automatically.
 *
 * Adding a NEW setting in FSM therefore needs no entry here at all.
 */
const KNOWN_FIELD_CONFIG = {

    /**
     * DateType - always present in this UDO. FSM has no defaultValue set on it,
     * so the app supplies one: code '2' = "Dispo date".
     * Remove defaultCode the moment defaultValue is maintained in FSM Admin.
     *
     * role ENTRY_DATE tells the frontend this setting decides which date a new
     * T&M entry defaults to. The frontend looks the field up BY ROLE, so the
     * externalId lives only here.
     */
    'z_TM_DateType': {
        defaultCode: '2',
        role: 'ENTRY_DATE'
    },

    /**
     * PersonID - holds the technician the settings record belongs to, as a
     * plain string (not an FSM object reference), so nothing in its UdfMeta
     * identifies it. Filled with the logged-in user's Person externalId.
     *
     * If this key does not match the real UDF, the startup warning
     * "configured field ... matched nothing" names it - copy the correct
     * externalId from the "fields:" log line just above it.
     */
    'z_TM_PersonId': {
        fill: 'PERSON_EXTERNAL_ID'
    }
};

/**
 * Config entry for a field, matched on externalId then name (case-insensitive).
 * @param {Object|null} meta - resolved UdfMeta
 * @returns {{configKey: string, config: Object}|null}
 */
function findFieldConfig(meta) {
    if (!meta) return null;

    const candidates = [meta.externalId, meta.name]
        .filter(v => typeof v === 'string' && v.length > 0)
        .map(v => v.trim().toLowerCase());

    if (candidates.length === 0) return null;

    const configKey = Object.keys(KNOWN_FIELD_CONFIG)
        .find(key => candidates.includes(key.toLowerCase()));

    return configKey ? { configKey, config: KNOWN_FIELD_CONFIG[configKey] } : null;
}

/**
 * FSM ids are 32-char hex, but be liberal: allow anything that cannot break out
 * of a quoted FSQL literal. Values failing this are dropped, not escaped.
 * @param {string} value
 * @returns {boolean}
 */
function isSafeFsqlLiteral(value) {
    return typeof value === 'string' && value.length > 0 && /^[A-Za-z0-9_.\- ]+$/.test(value);
}

/**
 * Normalise a person-identity argument to a clean, de-duplicated list.
 *
 * A user is not one externalId. FSM stores one Person row per type for the same
 * human - 'egleizds1' (ERPUSER) and 'egleizds2' (EMPLOYEE) - and their settings
 * record may carry either. Every function here that identifies a person takes
 * the whole list, and ORDER MATTERS: [0] is the primary (anchor) identity, the
 * one a newly created record is keyed on.
 *
 * A bare string is accepted so older callers keep working.
 *
 * @param {string|string[]|null|undefined} value
 * @returns {string[]} non-empty trimmed strings, duplicates removed, order kept
 */
function normalizePersonExternalIds(value) {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return [...new Set(
        list
            .filter(entry => typeof entry === 'string')
            .map(entry => entry.trim())
            .filter(Boolean)
    )];
}

/**
 * Human label for a UDF, most specific first.
 * description is what the settings tables show; the rest are fallbacks so a row
 * is never lost just because a field is empty in FSM.
 * @param {Object|null} meta - resolved UdfMeta
 * @param {string} metaId - raw UUID, last-resort label
 * @returns {string}
 */
function buildLabel(meta, metaId) {
    if (!meta) return metaId;
    return meta.description || meta.externalId || meta.name || metaId;
}

/**
 * True for a value that looks like a selection code ("1", "02", "10").
 * @param {string} value
 * @returns {boolean}
 */
function looksLikeCode(value) {
    return /^\d+$/.test(String(value).trim());
}

/**
 * Convert FSM's selectionKeyValues into dropdown options.
 *
 * Input : { "1": "Current date", "2": "Dispo date" }
 * Output: [ { key: "1", text: "Current date" },
 *           { key: "2", text: "Dispo date"   } ]
 *
 * The key is the CODE, because that is what a write stores. The dropdown shows
 * the text, so the user never sees the code.
 *
 * LEGACY SHAPE: some older UDFs carry it the other way round,
 * { "<display text>": "<code>" }. That is detected per entry, and only in the
 * unambiguous case - the key is not numeric and the value is - so a normal
 * { "1": "Current date" } entry is never misread.
 *
 * Sorted by code (numeric when possible) so the order matches how it was
 * configured in FSM rather than JSON key order. Non-selection fields return [].
 *
 * @param {Object|null} selectionKeyValues
 * @returns {Array<{key: string, text: string}>}
 */
function buildOptions(selectionKeyValues) {
    if (!selectionKeyValues || typeof selectionKeyValues !== 'object') {
        return [];
    }

    const options = Object.keys(selectionKeyValues).map(key => {
        const value = String(selectionKeyValues[key]);

        if (!looksLikeCode(key) && looksLikeCode(value)) {
            // Legacy: { "Dispo date": "2" }
            return { key: value, text: key };
        }

        // Current: { "2": "Dispo date" }
        return { key: String(key), text: value };
    });

    options.sort((a, b) => {
        const na = parseFloat(a.key);
        const nb = parseFloat(b.key);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.key.localeCompare(b.key);
    });

    return options;
}

/**
 * Readable form of a stored value.
 *
 * Accepts a value stored either as the code ("1", what this app writes) or as
 * the display text ("Current date", how records created by hand in FSM look).
 * Anything that matches no option is returned unchanged.
 *
 * @param {string} value - stored value
 * @param {Array<{key: string, text: string}>} options
 * @returns {string}
 */
function resolveDisplayValue(value, options) {
    if (!value || options.length === 0) return value;
    const match = options.find(option => option.key === value || option.text === value);
    return match ? match.text : value;
}

/**
 * The option that should be preselected for a field.
 *
 * Precedence: the field's own UdfMeta.defaultValue in FSM, then KNOWN_FIELD_CONFIG.
 * A UdoValue stores the option's display text, so a default given as a code
 * ('2') is translated to its text ('Dispo date'); a default given as the text
 * works just as well.
 *
 * @param {Object|null} meta - resolved UdfMeta
 * @param {Array<{key: string, code: string}>} options - from buildOptions
 * @param {Object|null} config - KNOWN_FIELD_CONFIG entry, when the field has one
 * @returns {string} option key to preselect, or '' for none
 */
function resolveDefaultOptionKey(meta, options, config) {
    const fsmDefault = meta?.defaultValue;
    const hasFsmDefault = fsmDefault !== undefined && fsmDefault !== null && String(fsmDefault) !== '';

    const configDefault = config?.defaultCode;
    const hasConfigDefault = configDefault !== undefined && configDefault !== null && String(configDefault) !== '';

    if (!hasFsmDefault && !hasConfigDefault) {
        return '';
    }

    const raw = hasFsmDefault ? String(fsmDefault) : String(configDefault);

    if (options.length === 0) {
        // Free-text field with a default - pass it through as-is.
        return raw;
    }

    // Accept the default written either way round: code or display text.
    const match = options.find(option => option.key === raw || option.text === raw);
    return match ? match.key : '';
}

module.exports = {

    /**
     * Fetch a UDO definition by name.
     *
     * Mirrors: SELECT w FROM UdoMeta w WHERE w.name = '<udoMetaName>'
     *
     * @param {string} udoMetaName - UDO definition name, e.g. 'TMExt_UserSettings'
     * @returns {Promise<Object|null>} raw UdoMeta object, or null
     */
    async getUdoMetaByName(udoMetaName) {
        try {
            if (!isSafeFsqlLiteral(udoMetaName)) {
                console.error('FSMService: refusing unsafe UDO meta name:', udoMetaName);
                return null;
            }

            const query = `SELECT w FROM UdoMeta w WHERE w.name = '${udoMetaName}'`;
            const data = await this.makeQueryRequest(query, UDO_META_DTOS);

            if (!data.data || data.data.length === 0) {
                return null;
            }

            return data.data[0]?.w || null;

        } catch (error) {
            console.error('FSMService: Error fetching UDO meta:', error.message);
            return null;
        }
    },

    /**
     * Fetch all UdoValue records belonging to a UDO definition, by the
     * definition's name.
     *
     * Mirrors:
     *   SELECT v FROM UdoValue v JOIN UdoMeta m ON v.meta = m
     *   WHERE m.name = '<udoMetaName>'
     *
     * @param {string} udoMetaName - UDO definition name
     * @returns {Promise<Array<Object>>} raw UdoValue objects (empty array on error)
     */
    async getUdoValuesByMetaName(udoMetaName) {
        try {
            if (!isSafeFsqlLiteral(udoMetaName)) {
                console.error('FSMService: refusing unsafe UDO meta name:', udoMetaName);
                return [];
            }

            const query = `SELECT v FROM UdoValue v JOIN UdoMeta m ON v.meta = m WHERE m.name = '${udoMetaName}'`;
            const data = await this.makeQueryRequest(query, UDO_VALUE_DTOS);

            if (!data.data || data.data.length === 0) {
                return [];
            }

            return data.data.map(row => row.v).filter(Boolean);

        } catch (error) {
            console.error('FSMService: Error fetching UDO values:', error.message);
            return [];
        }
    },

    /**
     * Resolve UDF Meta UUIDs to their metadata in as few requests as possible.
     *
     * The whole object is selected (SELECT w) rather than named fields, so this
     * keeps working if a field is absent in a given DTO version.
     *
     * @param {string[]} udfMetaIds - UDF Meta UUIDs (duplicates are fine)
     * @returns {Promise<Object>} map of id -> resolved meta
     */
    async getUdfMetaByIds(udfMetaIds) {
        const result = {};

        if (!Array.isArray(udfMetaIds) || udfMetaIds.length === 0) {
            return result;
        }

        const ids = [...new Set(udfMetaIds.filter(isSafeFsqlLiteral))];
        if (ids.length === 0) {
            return result;
        }

        for (let i = 0; i < ids.length; i += UDF_META_CHUNK_SIZE) {
            const chunk = ids.slice(i, i + UDF_META_CHUNK_SIZE);
            const inList = chunk.map(id => `'${id}'`).join(', ');

            try {
                const query = `SELECT w FROM UdfMeta w WHERE w.id IN (${inList})`;
                const data = await this.makeQueryRequest(query, UDF_META_DTOS);

                (data.data || []).forEach(row => {
                    const meta = row.w;
                    if (meta && meta.id) {
                        result[meta.id] = {
                            id: meta.id,
                            externalId: meta.externalId || null,
                            name: meta.name || null,
                            description: meta.description || null,
                            type: meta.type || null,
                            mandatory: meta.mandatory === true,
                            defaultValue: meta.defaultValue !== undefined ? meta.defaultValue : null,
                            selectionKeyValues: meta.selectionKeyValues || null,
                            // What the field points at, e.g. 'PERSON'. This is how
                            // the frontend recognises a person field without any
                            // hardcoded field name.
                            referencedObjectType: meta.referencedObjectType || null,
                            objectType: meta.objectType || null
                        };
                    }
                });

            } catch (error) {
                // One failed chunk must not lose the rest - unresolved ids simply
                // fall back to the raw UUID as their label.
                console.error('FSMService: Error resolving UdfMeta chunk:', error.message);
            }
        }

        return result;
    },

    /**
     * Read the app's user settings from FSM, definition and records together.
     *
     * When personExternalIds is given, only THAT person's record is returned
     * (zero or one). Everyone else's settings then never leave the server -
     * the dialog only ever shows the logged-in user's own record.
     *
     * personExternalIds is a LIST, not one value: the same human has one Person
     * row per type, each with its own externalId ('egleizds1' = ERPUSER,
     * 'egleizds2' = EMPLOYEE). A record saved under any of them is the same
     * person's record and must be found - see findUserSettingRecordForPerson.
     * A bare string is still accepted.
     *
     * @param {string} [udoMetaName=TMExt_UserSettings] - UDO definition name
     * @param {string|string[]} [personExternalIds] - restrict records to this person
     * @returns {Promise<{udoName: string, definition: Object|null, records: Array<Object>}>}
     */
    async getUserSettings(udoMetaName = USER_SETTINGS_UDO_NAME, personExternalIds = null) {
        // Definition and records are independent - fetch both at once.
        const [udoMeta, udoValues] = await Promise.all([
            this.getUdoMetaByName(udoMetaName),
            this.getUdoValuesByMetaName(udoMetaName)
        ]);

        // Every UUID we need a label for: the definition's fields, plus anything
        // a record carries that the definition no longer lists (a removed UDF
        // still has stored values). One resolution pass for all of them.
        const definitionMetaIds = Array.isArray(udoMeta?.udfMetas) ? udoMeta.udfMetas : [];
        const recordMetaIds = [];
        udoValues.forEach(record => {
            (record.udfValues || []).forEach(udf => {
                if (udf && typeof udf.meta === 'string') {
                    recordMetaIds.push(udf.meta);
                }
            });
        });

        const metaById = await this.getUdfMetaByIds([...definitionMetaIds, ...recordMetaIds]);

        // ---- Definition: every possible setting, in FSM's own field order ----
        const matchedConfigKeys = new Set();

        const definition = udoMeta ? {
            id: udoMeta.id,
            name: udoMeta.name || udoMetaName,
            description: udoMeta.description || null,
            fields: definitionMetaIds.map(metaId => {
                const meta = metaById[metaId] || null;
                // [] when the field is not a selection list, or its list is empty
                const options = buildOptions(meta?.selectionKeyValues);

                const configMatch = findFieldConfig(meta);
                if (configMatch) {
                    matchedConfigKeys.add(configMatch.configKey);
                }
                const config = configMatch?.config || null;

                // Straight from FSM when the UDF is an object reference; from
                // KNOWN_FIELD_CONFIG when it is a plain field FSM cannot mark.
                const fillWith = (String(meta?.referencedObjectType || '').toUpperCase() === 'PERSON')
                    ? 'PERSON_EXTERNAL_ID'
                    : (config?.fill || null);

                return {
                    metaId: metaId,
                    name: meta?.name || null,
                    externalId: meta?.externalId || null,
                    description: meta?.description || null,
                    label: buildLabel(meta, metaId),
                    type: meta?.type || null,
                    mandatory: meta?.mandatory === true,
                    defaultValue: meta?.defaultValue ?? null,
                    options: options,
                    referencedObjectType: meta?.referencedObjectType || null,
                    // What the frontend must fill in itself, e.g. the logged-in
                    // user's Person externalId. null = nothing to fill.
                    fillWith: fillWith,
                    // What the app uses this setting FOR, e.g. 'ENTRY_DATE'.
                    // Lets the frontend find a setting without knowing its name.
                    role: config?.role || null,
                    // Preselected option, '' for none
                    defaultOptionKey: resolveDefaultOptionKey(meta, options, config)
                };
            })
        } : null;

        // A configured key that matches no field means the UDF was renamed in FSM
        // or the key is wrong - its default / auto-fill would then silently not
        // apply, so it is worth a warning. This is the only diagnostic left here.
        if (definition) {
            Object.keys(KNOWN_FIELD_CONFIG)
                .filter(key => !matchedConfigKeys.has(key))
                .forEach(key => {
                    console.warn(`FSMService: user-settings field '${key}' from KNOWN_FIELD_CONFIG `
                        + `matched nothing in '${definition.name}' - its default/auto-fill is not applied.`);
                });
        }

        // ---- Records: the settings actually stored ----
        const records = udoValues.map(record => {
            const settings = (record.udfValues || []).map(udf => {
                const meta = metaById[udf.meta] || null;
                const options = buildOptions(meta?.selectionKeyValues);
                const value = udf.value !== undefined && udf.value !== null ? String(udf.value) : '';

                return {
                    metaId: udf.meta || null,
                    name: meta?.name || null,
                    externalId: meta?.externalId || null,
                    description: meta?.description || null,
                    // What the Setting column shows
                    label: buildLabel(meta, udf.meta),
                    // Raw stored value (a code for selection fields)
                    value: value,
                    // Readable form - the Value column shows this
                    displayValue: resolveDisplayValue(value, options)
                };
            });

            return {
                id: record.id,
                externalId: record.externalId || null,
                inactive: record.inactive === true,
                createDateTime: record.createDateTime || null,
                lastChanged: record.lastChanged || null,
                settings: settings
            };
        });

        // Stable, predictable order: oldest record first.
        records.sort((a, b) => String(a.createDateTime || '').localeCompare(String(b.createDateTime || '')));

        const result = { udoName: udoMetaName, definition: definition, records: records };

        // Narrow to the one person's record when asked.
        const idList = normalizePersonExternalIds(personExternalIds);
        if (idList.length > 0) {
            // One candidate externalId per identity - a record saved under the
            // EMPLOYEE externalId is still this person's record.
            const derivedExternalIds = definition?.id
                ? idList.map(externalId => `${definition.id}_${externalId}`)
                : [];
            const own = this.findUserSettingRecordForPerson(idList, derivedExternalIds, result);
            result.records = own ? [own] : [];
        }

        return result;
    },

    /* =========================================================================
     * WRITE
     * ========================================================================= */

    /**
     * Find the settings record that belongs to one person.
     *
     * WHY NOT A FILTERED QUERY
     *   Filtering a UdoValue by one of its UDFs
     *     ... AND v.udf.z_TM_PersonID = '...'
     *   is not supported by the Query API, so it is matched here instead. This
     *   costs nothing extra: getUserSettings() is the same three queries the
     *   dialog already runs, and it comes back with every UDF externalId already
     *   resolved, so the match is a plain comparison.
     *
     * WHY A LIST OF externalIds AND NOT ONE
     *   The same human has one Person row per type, each with its own externalId
     *   ('egleizds1' = ERPUSER, 'egleizds2' = EMPLOYEE). Whichever one was
     *   current when a record was first saved is what sits in its z_TM_PersonID.
     *   Matching on a single "current" externalId would miss a record stored
     *   under the other one, and the caller would then CREATE a second record -
     *   leaving the user with two settings records and their saved choice
     *   silently unreachable.
     *
     *   Matching against every identity the user resolves to closes that hole and
     *   also repairs records written before the identity order was made
     *   deterministic: they are found and updated in place.
     *
     * Two ways a record can belong to the person, checked in order:
     *   1. its person UDF holds ANY of those externalIds - works for records
     *      created by hand in FSM, which have no externalId of their own
     *   2. its own externalId is one this app would derive - the belt-and-braces
     *      case, in case the person UDF was cleared
     *
     * The person UDF is identified by the definition's fillWith flag, not by
     * name, so it keeps working if the field is renamed in FSM.
     *
     * @param {string|string[]} personExternalIds - every Person externalId of this user
     * @param {string|string[]} recordExternalIds - the externalIds this app would derive
     * @param {Object} settings - result of getUserSettings()
     * @returns {Object|null} the matching record, or null when the person has none
     */
    findUserSettingRecordForPerson(personExternalIds, recordExternalIds, settings) {
        const records = settings?.records || [];
        if (records.length === 0) return null;

        const personIdSet = new Set(normalizePersonExternalIds(personExternalIds));
        const recordIdSet = new Set(normalizePersonExternalIds(recordExternalIds));

        const personFieldExternalId = (settings?.definition?.fields || [])
            .find(field => field.fillWith === 'PERSON_EXTERNAL_ID')?.externalId || null;

        return records.find(record => {
            if (personFieldExternalId && personIdSet.size > 0) {
                const hit = (record.settings || []).some(setting =>
                    setting.externalId === personFieldExternalId && personIdSet.has(setting.value));
                if (hit) return true;
            }
            return record.externalId ? recordIdSet.has(record.externalId) : false;
        }) || null;
    },

    /**
     * Create or update the settings record of one person.
     *
     * CREATE OR UPDATE is decided by looking the person up first - see
     * findUserSettingRecordForPerson. Both branches are a PATCH; only the target
     * differs:
     *
     *   update -> PATCH /api/data/v4/UdoValue/{id}
     *             the record's own id, so a record created by hand in FSM (no
     *             externalId) is updated in place instead of being duplicated
     *   create -> PATCH /api/data/v4/UdoValue/externalId/{externalId}
     *             with the derived externalId, which FSM upserts
     *
     * Both use ?dtos=UdoValue.10&account=..&company=..&forceUpdate=true
     *
     * The derived externalId is <UdoMeta id>_<person externalId>, e.g.
     * 67F7CD54D1B24F4D8B7B715DEFAB472E_egleizds1 - unique per person per UDO,
     * and written on updates too so older records gain one.
     *
     * udfValues address their UDF by externalId rather than UUID, exactly as in
     * the payload FSM expects:
     *
     *   { "meta": { "externalId": "z_TM_DateType" }, "value": "1" }
     *
     * Values are sent as given - for a selection field that is the CODE (see the
     * note on selectionKeyValues at the top of this file).
     *
     * @param {Array<{externalId: string, value: *}>} settingValues - one entry per setting to write
     * @param {string|string[]} personExternalIds - every Person externalId of this user;
     *        the FIRST is the primary (the anchor ERPUSER identity) and is what a
     *        newly derived record externalId is built from. The rest are used only
     *        to RECOGNISE an existing record, never to create one.
     * @param {string} [udoMetaName=TMExt_UserSettings] - UDO definition name
     * @returns {Promise<{externalId: string, id: string|null, created: boolean, data: Object}>}
     */
    async saveUserSetting(settingValues, personExternalIds, udoMetaName = USER_SETTINGS_UDO_NAME) {
        const idList = normalizePersonExternalIds(personExternalIds);
        if (idList.length === 0) {
            throw new Error('saveUserSetting: personExternalIds is required - it is part of the record externalId');
        }
        if (!Array.isArray(settingValues) || settingValues.length === 0) {
            throw new Error('saveUserSetting: no setting values to write');
        }

        // One read, already narrowed to this person: gives the UDO id and, when
        // the person has one, their existing record - found under ANY of their
        // identities, so an older record is updated instead of duplicated.
        const settings = await this.getUserSettings(udoMetaName, idList);
        const udoMetaId = settings?.definition?.id || null;

        if (!udoMetaId) {
            throw new Error(`saveUserSetting: UDO '${udoMetaName}' not found in FSM`);
        }

        // Derived from the PRIMARY identity only - a new record is always created
        // under the anchor externalId, never under a secondary one.
        const recordExternalId = `${udoMetaId}_${idList[0]}`;
        const existing = settings.records[0] || null;

        // Drop empty values: FSM would otherwise store empty strings for settings
        // the user did not fill in.
        const udfValues = settingValues
            .filter(entry => entry
                && entry.externalId
                && entry.value !== undefined
                && entry.value !== null
                && String(entry.value) !== '')
            .map(entry => ({
                meta: { externalId: entry.externalId },
                value: String(entry.value)
            }));

        if (udfValues.length === 0) {
            throw new Error('saveUserSetting: every setting value was empty');
        }

        const payload = {
            externalId: recordExternalId,
            meta: udoMetaId,
            udfValues: udfValues
        };

        const destination = await DestinationService.getDestination(this.destinationName);
        const token = await TokenCache.getToken(destination);

        const baseUrl = destination.destinationConfiguration.URL;
        const { account, company } = this._getAccountCompany(destination);

        // Update an existing record by its own id; create by the derived
        // externalId. Addressing an existing record by id is what stops a
        // hand-made record (externalId null) from being duplicated.
        const fullUrl = existing?.id
            ? `${baseUrl}/api/data/v4/UdoValue/${encodeURIComponent(existing.id)}`
            : `${baseUrl}/api/data/v4/UdoValue/externalId/${encodeURIComponent(recordExternalId)}`;

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Account-ID': destination.destinationConfiguration['URL.headers.X-Account-ID'],
            'X-Company-ID': destination.destinationConfiguration['URL.headers.X-Company-ID'],
            'X-Client-ID': destination.destinationConfiguration['URL.headers.X-Client-ID'],
            'X-Client-Version': destination.destinationConfiguration['URL.headers.X-Client-Version']
        };

        try {
            const response = await axios.patch(fullUrl, payload, {
                params: {
                    dtos: 'UdoValue.10',
                    account,
                    company,
                    // Upsert: create when the externalId is unknown, update otherwise.
                    forceUpdate: true
                },
                headers: headers
            });

            return {
                externalId: recordExternalId,
                id: existing?.id || null,
                // Decided by the lookup above, not by the HTTP status - the
                // create branch is an upsert and can legitimately return 200.
                created: !existing,
                data: response.data
            };

        } catch (error) {
            console.error('FSMService: Error saving user setting:', error.response?.data || error.message);
            throw error;
        }
    }
};