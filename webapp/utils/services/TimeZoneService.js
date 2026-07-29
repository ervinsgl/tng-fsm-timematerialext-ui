/**
 * TimeZoneService.js
 *
 * Single source of truth for the company time zone used by every T&M
 * date/time operation.
 *
 * Business Context:
 *   FSM stores time-effort timestamps as UTC instants but interprets them
 *   against startDateTimeTimeZoneId. The zone used to COMPUTE the instant and
 *   the zone SENT to FSM must always be identical - if they drift apart,
 *   entries silently land on the wrong calendar day near midnight. Holding the
 *   value in one module makes that structural instead of accidental.
 *
 *   The device time zone (Intl) is deliberately NOT a source. It varies with
 *   where the technician's phone happens to be, and the workday date is a
 *   payroll fact tied to the company, not to the device. It is exposed only so
 *   the Context Info dialog can surface a mismatch for diagnosis.
 *
 *   FSM exposes no readable company time zone: a GET_SETTINGS probe against
 *   timeZone / timezone / TimeZone / companyTimeZone / CoreSystems.Company.
 *   TimeZone / CoreSystems.Timezone returned null for all of them, while
 *   documented keys (userPerson, CoreSystems.FSM.StandaloneCompany) answered
 *   normally - so the mechanism works and those values simply are not
 *   published. GET_SETTINGS is also Web-UI-only; the Mobile WebContainer has no
 *   Shell SDK. DEFAULT_TZ is therefore the single value for both clients.
 *
 *   To source the zone externally later, call set(tzId, "<source>") once during
 *   startup, before any payload is built. A backend endpoint is preferable to a
 *   Shell company setting, because both Web UI and Mobile can read it and stay
 *   in agreement.
 *
 * Inputs:   IANA zone id string (e.g. "Europe/Berlin")
 * Outputs:  current zone id, provenance label, device-zone diagnostics
 * Dependencies: none (Intl only)
 *
 * Error Handling:
 *   set() validates the id via Intl and refuses invalid values, so a bad
 *   configured value cannot break every timestamp in the app.
 *
 * @file TimeZoneService.js
 * @module com/tns/fsm/timematerialext/app/utils/services/TimeZoneService
 */
sap.ui.define([], () => {
    "use strict";

    /**
     * The company time zone. Berlin is UTC+01:00 (CET) in winter and UTC+02:00
     * (CEST) under EU summer time; all DST handling is derived from this id via
     * Intl, so this constant is the only thing to change for a different zone.
     */
    const DEFAULT_TZ = "Europe/Berlin";

    let _tzId = DEFAULT_TZ;
    let _source = "default";

    return {

        DEFAULT_TZ: DEFAULT_TZ,

        /**
         * Current company time zone (IANA id).
         * @returns {string} e.g. "Europe/Berlin"
         */
        get() {
            return _tzId;
        },

        /**
         * Where the current value came from - shown in the Context Info dialog.
         * @returns {string} "default" | "manual" | caller-supplied label
         */
        getSource() {
            return _source;
        },

        /**
         * Set the zone. Rejects invalid ids; the previous value stands.
         *
         * @param {string} tzId - IANA zone id
         * @param {string} [source="manual"] - provenance label
         * @returns {boolean} true if accepted
         */
        set(tzId, source) {
            if (!tzId || typeof tzId !== "string") {
                return false;
            }
            if (!this.isValidZone(tzId)) {
                console.warn(
                    "TimeZoneService: rejected invalid time zone '" + tzId +
                    "'. Keeping '" + _tzId + "'."
                );
                return false;
            }
            _tzId = tzId;
            _source = source || "manual";
            return true;
        },

        /**
         * Validate an IANA zone id by asking Intl to use it.
         * @param {string} tzId
         * @returns {boolean}
         */
        isValidZone(tzId) {
            try {
                new Intl.DateTimeFormat("en-US", { timeZone: tzId }).format(new Date());
                return true;
            } catch (e) {
                return false;
            }
        },

        /**
         * The zone the browser/device reports. Display and diagnostics only -
         * never a source for timestamp computation.
         * @returns {string} IANA id, or "" if unavailable
         */
        getDeviceZone() {
            try {
                return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
            } catch (e) {
                return "";
            }
        },

        /**
         * True when the device sits in a different zone than the configured one.
         * Drives the optional "Device Zone" row in the Context Info dialog, so a
         * wrong-day report can be diagnosed without a debugging session.
         * @returns {boolean}
         */
        hasDeviceMismatch() {
            const device = this.getDeviceZone();
            return !!device && device !== _tzId;
        },

        /**
         * Restore the built-in default. Used by tests.
         */
        reset() {
            _tzId = DEFAULT_TZ;
            _source = "default";
        }
    };
});