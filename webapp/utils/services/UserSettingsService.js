/**
 * UserSettingsService.js
 *
 * Frontend service for the app's user settings, stored in FSM as the UDO
 * 'TMExt_UserSettings'.
 *
 * Two things come back from one request:
 *   definition - every field the UDO can hold, in FSM's own order, each with a
 *                label and (for SELECTIONLIST fields) its dropdown options.
 *                This drives the "available settings" table.
 *   records    - the settings actually stored; one table each.
 *
 * The backend (utils/FSMUdoService.js) already resolves every UDF meta UUID to
 * a readable label and turns selectionKeyValues into options, so this service
 * only fetches, caches and hands the rows to the dialog.
 *
 * Key Features:
 * - Definition + records in ONE request
 * - Session cache with explicit refresh
 * - Display-ready shape: fields[] = { label, options[] }, settings[] = { label, value }
 *
 * API Endpoint Used:
 * - GET /api/v1/get-user-settings
 *
 * @file UserSettingsService.js
 * @module com/tns/fsm/timematerialext/app/utils/services/UserSettingsService
 */
sap.ui.define([
    "com/tns/fsm/timematerialext/app/utils/helpers/DateTimeService",
    "com/tns/fsm/timematerialext/app/utils/services/TimeZoneService"
], (DateTimeService, TimeZoneService) => {
    "use strict";

    /**
     * Codes of the ENTRY_DATE setting, and what each one means for a new entry:
     *
     *   '1' Current date - default to today
     *   '2' Dispo date   - default to the activity's planned start date
     *
     * These are FSM selection codes, so they belong to the data. They are named
     * here because the BEHAVIOUR attached to each is app logic, and this is the
     * only place that maps one to the other. Which UDF carries them is not
     * hardcoded anywhere - the field is found by its role (see getEffectiveValue).
     *
     * @type {string}
     */
    const ENTRY_DATE_CURRENT = "1";
    const ENTRY_DATE_PLANNED = "2";

    /**
     * Cached payload from the last successful fetch: { definition, records }.
     * @type {Object|null}
     * @private
     */
    let _data = null;

    /**
     * In-flight request, so two rapid dialog opens share one call.
     * @type {Promise|null}
     * @private
     */
    let _loadingPromise = null;

    /**
     * Normalise a person-identity argument to a clean list, order preserved.
     *
     * The app knows a user by several Person externalIds (one per Person type).
     * Every call that identifies the user carries all of them; [0] is primary.
     * A bare string is accepted so older callers keep working.
     *
     * @param {string|string[]|null|undefined} value
     * @returns {string[]}
     * @private
     */
    function _toIdList(value) {
        const list = Array.isArray(value) ? value : (value ? [value] : []);
        return [...new Set(
            list
                .filter(entry => typeof entry === "string")
                .map(entry => entry.trim())
                .filter(Boolean)
        )];
    }

    return {

        /**
         * Fetch the UDO definition and the settings records.
         * Returns the cache unless forceReload is set.
         *
         * With personExternalIds the backend returns only that person's own
         * record (zero or one) - nobody else's settings reach the browser.
         *
         * It is a LIST because one human has one Person row per type, each with
         * its own externalId ('egleizds1' = ERPUSER, 'egleizds2' = EMPLOYEE),
         * and their record may be stored under any of them. Sending all of them
         * is what stops the app from missing an existing record and creating a
         * duplicate. The FIRST is the primary identity. A bare string still works.
         *
         * @param {boolean} [forceReload=false] - bypass the cache
         * @param {string|string[]} [personExternalIds] - restrict records to this person
         * @returns {Promise<{definition: Object|null, records: Array<Object>}>}
         */
        async fetchUserSettings(forceReload, personExternalIds) {
            if (!forceReload && _data !== null) {
                return _data;
            }

            if (_loadingPromise) {
                return _loadingPromise;
            }

            _loadingPromise = (async () => {
                try {
                    const idList = _toIdList(personExternalIds);
                    const url = idList.length > 0
                        ? `/api/v1/get-user-settings?personExternalIds=${encodeURIComponent(idList.join(","))}`
                        : "/api/v1/get-user-settings";

                    const response = await fetch(url, {
                        method: "GET",
                        headers: { "Content-Type": "application/json" }
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to load user settings: ${response.status}`);
                    }

                    const body = await response.json();

                    _data = {
                        definition: body.definition || null,
                        records: Array.isArray(body.records) ? body.records : []
                    };
                    return _data;

                } catch (error) {
                    console.error("UserSettingsService: Error loading user settings:", error);
                    // Do NOT cache the failure - the next open should retry.
                    _data = null;
                    throw error;

                } finally {
                    _loadingPromise = null;
                }
            })();

            return _loadingPromise;
        },

        /**
         * Create or update the current user's settings record.
         *
         * Upsert: the backend derives the record externalId from the UDO id and
         * the person externalId, so the same call creates the record the first
         * time and updates it afterwards.
         *
         * The cache is dropped on success, so the next fetch shows the record.
         *
         * @param {string|string[]} personExternalIds - every Person externalId of this
         *        user, primary first. All are used to find an existing record;
         *        only the first keys a new one.
         * @param {Array<{externalId: string, value: string}>} values - one entry per setting
         * @returns {Promise<{externalId: string, created: boolean}>}
         */
        async saveUserSetting(personExternalIds, values) {
            const response = await fetch("/api/v1/save-user-setting", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ personExternalIds: _toIdList(personExternalIds), values })
            });

            const body = await response.json().catch(() => ({}));

            if (!response.ok || body.success !== true) {
                throw new Error(body.message || `Failed to save user setting: ${response.status}`);
            }

            // Force the next read to hit FSM so the new record shows up.
            _data = null;

            return { externalId: body.externalId, created: body.created === true };
        },

        /* =====================================================================
         * APPLYING THE SETTINGS
         * ===================================================================== */

        /**
         * Load the settings once, if they are not cached yet.
         * Safe to call on every use - it is a no-op after the first load.
         *
         * @param {string|string[]} personExternalIds - the logged-in user's Person
         *        externalIds, primary first
         * @returns {Promise<void>}
         */
        async ensureLoaded(personExternalIds) {
            if (this.isLoaded()) return;

            try {
                await this.fetchUserSettings(false, personExternalIds);
            } catch (error) {
                // Never let a settings problem block the feature that uses it -
                // callers fall back to their own defaults.
                console.error("UserSettingsService: settings unavailable, using defaults", error);
            }
        },

        /**
         * The value in force for the setting with a given role.
         *
         * What the user saved wins; otherwise the field's default. Returns ''
         * when the UDO has no field for that role at all.
         *
         * The field is found BY ROLE ('ENTRY_DATE'), never by name, so renaming
         * the UDF in FSM changes nothing here - only KNOWN_FIELD_CONFIG in
         * utils/FSMUdoService.js.
         *
         * @param {string} role - e.g. 'ENTRY_DATE'
         * @returns {string} the value in force, or ''
         */
        getEffectiveValue(role) {
            const field = this.getFields().find(f => f.role === role);
            if (!field) return "";

            const saved = (this.getRecords()[0]?.settings || [])
                .find(setting => setting.externalId === field.externalId);

            const value = saved?.value;
            if (value !== undefined && value !== null && String(value) !== "") {
                // A legacy record may hold the display text - map it to its code.
                const match = (field.options || [])
                    .find(option => option.key === value || option.text === value);
                return match ? match.key : String(value);
            }

            return field.defaultOptionKey || "";
        },

        /**
         * Date a newly added T&M entry should default to, as yyyy-MM-dd.
         *
         *   ENTRY_DATE '1' (Current date) -> today
         *   ENTRY_DATE '2' (Dispo date)   -> the activity's planned start date
         *
         * Falls back to the planned start date whenever the setting is missing,
         * unreadable or unknown, so behaviour without settings is exactly what
         * it was before they existed.
         *
         * @param {string|null} activityPlannedStartDate - ISO datetime from the activity
         * @returns {string} yyyy-MM-dd, or '' when neither date can be determined
         */
        resolveEntryDate(activityPlannedStartDate) {
            const plannedDate = activityPlannedStartDate
                ? String(activityPlannedStartDate).split("T")[0]
                : "";

            if (this.getEffectiveValue("ENTRY_DATE") === ENTRY_DATE_CURRENT) {
                return this._today() || plannedDate;
            }

            // ENTRY_DATE_PLANNED, and every fallback case.
            return plannedDate;
        },

        /**
         * Today's date in the COMPANY time zone, as yyyy-MM-dd.
         *
         * The company zone, not the device zone: an entry's date is a payroll
         * fact tied to the company, and a technician's phone travelling abroad
         * must not move a workday onto a different calendar date. This is the
         * same rule TimeZoneService documents for time efforts.
         *
         * @returns {string} yyyy-MM-dd, or '' if it cannot be determined
         * @private
         */
        _today() {
            try {
                return DateTimeService.toZonedDateString(new Date().toISOString(), TimeZoneService.get()) || "";
            } catch (error) {
                console.error("UserSettingsService: could not resolve today in the company zone", error);
                return "";
            }
        },

        /**
         * Cached UDO definition (synchronous). Null when nothing loaded yet.
         * @returns {Object|null}
         */
        getDefinition() {
            return _data ? _data.definition : null;
        },

        /**
         * Cached definition fields (synchronous). Empty array when not loaded.
         * @returns {Array<Object>}
         */
        getFields() {
            return _data?.definition?.fields || [];
        },

        /**
         * Cached settings records (synchronous). Empty array when not loaded.
         * @returns {Array<Object>}
         */
        getRecords() {
            return _data ? _data.records : [];
        },

        /**
         * True when a successful fetch has already happened this session.
         * @returns {boolean}
         */
        isLoaded() {
            return _data !== null;
        },

        /**
         * Drop the cache so the next fetch hits the backend.
         */
        clearCache() {
            _data = null;
        }
    };
});