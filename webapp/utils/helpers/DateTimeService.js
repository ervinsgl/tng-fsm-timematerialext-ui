/**
 * DateTimeService.js
 * 
 * Utility service for duration and datetime calculations.
 * Used by T&M entry forms (Time Effort, Mileage, Time & Material).
 * 
 * Key Features:
 * - Generate ISO datetime strings for FSM API
 * - Calculate end datetime from start + duration
 * - Calculate duration between two datetimes
 * - Resolve DST-correct UTC offset labels for FSM payloads
 * - Handle model updates for datetime/duration changes
 * - Provide default values for new T&M entries
 * 
 * DateTime Format: ISO 8601 without milliseconds (e.g., "2025-11-28T12:30:00Z")
 * Date Format: yyyy-MM-dd (e.g., "2025-11-28")
 * 
 * @file DateTimeService.js
 * @module com/tns/fsm/timematerialext/app/utils/helpers/DateTimeService
 * @requires com/tns/fsm/timematerialext/app/utils/services/TimeZoneService
 */
sap.ui.define([
    "com/tns/fsm/timematerialext/app/utils/services/TimeZoneService"
], (TimeZoneService) => {
    "use strict";

    return {
        
        /* =========================================================================
         * DATETIME STRING GENERATORS
         * ========================================================================= */

        /**
         * Get current datetime in ISO format for API.
         * @returns {string} ISO datetime string (e.g., "2025-11-28T12:30:00Z")
         */
        getNowDateTimeString() {
            const now = new Date();
            return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
        },

        /**
         * Get datetime with offset in ISO format.
         * @param {number} offsetMinutes - Minutes to add (can be negative)
         * @returns {string} ISO datetime string
         */
        getDateTimeWithOffset(offsetMinutes) {
            const date = new Date();
            date.setMinutes(date.getMinutes() + offsetMinutes);
            return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
        },

        /* =========================================================================
         * TIMEZONE HELPERS
         *
         * The zone comes from TimeZoneService (default Europe/Berlin) so that the
         * zone used to COMPUTE instants is always the same one sent to FSM in
         * startDateTimeTimeZoneId.
         * ========================================================================= */

        /**
         * Return the UTC offset label for a zone at a given instant.
         *
         * Purpose:
         *   FSM time-effort payloads carry a `timeZoneId` field in "UTC+HH:MM"
         *   form. A hardcoded value is wrong for half the year: Berlin is
         *   UTC+01:00 (CET) in winter and UTC+02:00 (CEST) under summer time.
         *   EU summer time runs from the last Sunday in March to the last Sunday
         *   in October, so a fixed "UTC+02:00" is incorrect for roughly five
         *   months every year.
         *
         * Business Context:
         *   Replaces the previously hardcoded `timeZoneId: "UTC+02:00"` in
         *   TMPayloadService (both the standalone time-effort builder and the
         *   combined Time & Material builder).
         *
         * Implementation Details:
         *   Primary path uses Intl `timeZoneName: 'longOffset'`, which yields
         *   "GMT+02:00". Engines without longOffset support fall through to
         *   _offsetLabelFromParts, which uses the same format-and-compare
         *   technique as zonedDateToAnchorUtc. No external library.
         *
         * Error Handling:
         *   Any Intl failure degrades to the fallback; total failure returns
         *   Berlin standard time rather than throwing mid-payload-build.
         *
         * @param {string|Date} [at] - the instant the label describes.
         *        MUST be the entry's own startDateTime, not "now" — a January
         *        entry created in July has to report UTC+01:00.
         * @param {string} [tzId] - IANA zone; defaults to TimeZoneService
         * @returns {string} "UTC+HH:MM" or "UTC-HH:MM"
         */
        getUtcOffsetLabel(at, tzId) {
            const zone = tzId || TimeZoneService.get();
            let d = at ? new Date(at) : new Date();
            if (isNaN(d.getTime())) {
                d = new Date();
                console.warn("DateTimeService.getUtcOffsetLabel: unparseable instant '" + at +
                             "' — falling back to now. Offset may be wrong for " +
                             "backdated entries.");
            }

            let label = null;
            try {
                const parts = new Intl.DateTimeFormat('en-US', {
                    timeZone: zone,
                    timeZoneName: 'longOffset'
                }).formatToParts(d);
                const name = (parts.find(p => p.type === 'timeZoneName') || {}).value || "";
                const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
                if (m) {
                    label = "UTC" + m[1] + m[2] + ":" + m[3];
                } else if (name === "GMT") {
                    label = "UTC+00:00";
                }
            } catch (e) {
                // longOffset unsupported — fall through
            }

            if (label === null) {
                label = this._offsetLabelFromParts(d, zone);
            }

            return label;
        },

        /**
         * Fallback offset computation: render the instant in the target zone,
         * read it back as if it were UTC, and take the difference.
         *
         * @param {Date} d - instant
         * @param {string} zone - IANA zone
         * @returns {string} "UTC+HH:MM"
         * @private
         */
        _offsetLabelFromParts(d, zone) {
            try {
                const p = {};
                new Intl.DateTimeFormat('en-US', {
                    timeZone: zone,
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false
                }).formatToParts(d).forEach(x => { p[x.type] = x.value; });

                const asZone = Date.UTC(
                    parseInt(p.year, 10),
                    parseInt(p.month, 10) - 1,
                    parseInt(p.day, 10),
                    parseInt(p.hour === '24' ? '0' : p.hour, 10),
                    parseInt(p.minute, 10),
                    parseInt(p.second, 10)
                );

                let mins = Math.round((asZone - d.getTime()) / 60000);
                const sign = mins < 0 ? '-' : '+';
                mins = Math.abs(mins);
                const hh = String(Math.floor(mins / 60)).padStart(2, '0');
                const mm = String(mins % 60).padStart(2, '0');
                return "UTC" + sign + hh + ":" + mm;
            } catch (e) {
                console.warn("DateTimeService: offset resolution failed for '" + zone +
                             "', defaulting to UTC+01:00", e);
                return "UTC+01:00";   // Berlin standard time
            }
        },

        /**
         * Extract the company-zone calendar date from an ISO instant.
         *
         * Stored startDateTime / date values are UTC instants that FSM
         * interprets in the company time zone. A naive iso.split('T')[0]
         * returns the UTC date, one day early whenever the local time crosses
         * midnight (e.g. a value stored as 22:01Z is 00:01 Berlin the next day).
         * This converts the instant to the local wall-clock date so the
         * displayed date matches FSM Web. Bare "yyyy-MM-dd" is returned
         * unchanged.
         *
         * @param {string} isoDateTime - ISO instant or "yyyy-MM-dd"
         * @param {string} [tzId] - IANA zone; defaults to TimeZoneService
         * @returns {string} date in "yyyy-MM-dd", or "" if unparseable
         */
        toZonedDateString(isoDateTime, tzId) {
            if (!isoDateTime) return "";
            // Bare date with no time component: nothing to convert.
            if (/^\d{4}-\d{2}-\d{2}$/.test(isoDateTime)) return isoDateTime;
            const d = new Date(isoDateTime);
            if (isNaN(d.getTime())) return "";
            // en-CA yields yyyy-MM-dd; timeZone pins it to local wall-clock.
            try {
                return new Intl.DateTimeFormat('en-CA', {
                    timeZone: tzId || TimeZoneService.get(),
                    year: 'numeric', month: '2-digit', day: '2-digit'
                }).format(d);
            } catch (e) {
                return isoDateTime.split('T')[0];
            }
        },

        /**
         * Convert a company-zone wall-clock time to the equivalent UTC ISO
         * instant.
         *
         * Mirrors the create-path anchor (TMSaveMixin._localToUtc): time efforts
         * anchor to 00:01 local on their own date, and FSM stores them against
         * startDateTimeTimeZoneId. When re-saving an edited entry we must
         * rebuild the instant from the (local) date the same way, NOT by pasting
         * the old UTC time portion onto the new date — that would shift the
         * entry by the offset (1-2h), rolling the date over near midnight.
         * Resolves DST via Intl, no external library.
         *
         * @param {string} dateStr - "yyyy-MM-dd" (local date)
         * @param {number} [hours=0] - local hour
         * @param {number} [minutes=1] - local minute
         * @param {string} [tzId] - IANA zone; defaults to TimeZoneService
         * @returns {string} UTC ISO instant (no milliseconds), or "" if unparseable
         */
        zonedDateToAnchorUtc(dateStr, hours, minutes, tzId) {
            const zone = tzId || TimeZoneService.get();
            const normalized = this.toZonedDateString(dateStr, zone) || dateStr;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized || "")) return "";
            const h = (hours === undefined) ? 0 : hours;
            const min = (minutes === undefined) ? 1 : minutes;
            const [y, m, d] = normalized.split('-').map(n => parseInt(n, 10));
            // First guess: treat the wanted wall-clock as if it were UTC.
            const guess = new Date(Date.UTC(y, m - 1, d, h, min, 0));
            const dtf = new Intl.DateTimeFormat('en-US', {
                timeZone: zone,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            });
            const parts = {};
            dtf.formatToParts(guess).forEach(p => { parts[p.type] = p.value; });
            const asLocal = Date.UTC(
                parseInt(parts.year, 10),
                parseInt(parts.month, 10) - 1,
                parseInt(parts.day, 10),
                parseInt(parts.hour === '24' ? '0' : parts.hour, 10),
                parseInt(parts.minute, 10),
                parseInt(parts.second, 10)
            );
            const offsetMs = asLocal - guess.getTime();
            const utc = new Date(guess.getTime() - offsetMs);
            return utc.toISOString().replace(/\.\d{3}Z$/, 'Z');
        },

        /* -------------------------------------------------------------------------
         * BACKWARD-COMPATIBLE ALIASES
         * Existing call sites (TMTableMixin, TMEditMixin) keep working unchanged.
         * Both now resolve their zone from TimeZoneService instead of a literal.
         * ------------------------------------------------------------------------- */

        /**
         * @deprecated Use toZonedDateString(). Kept so existing callers compile.
         * @param {string} isoDateTime
         * @returns {string} "yyyy-MM-dd"
         */
        toBerlinDateString(isoDateTime) {
            return this.toZonedDateString(isoDateTime);
        },

        /**
         * @deprecated Use zonedDateToAnchorUtc(). Kept so existing callers compile.
         * @param {string} dateStr
         * @param {number} [hours=0]
         * @param {number} [minutes=1]
         * @returns {string} UTC ISO instant
         */
        berlinDateToAnchorUtc(dateStr, hours, minutes) {
            return this.zonedDateToAnchorUtc(dateStr, hours, minutes);
        },

        /* =========================================================================
         * DURATION CALCULATIONS
         * ========================================================================= */

        /**
         * Calculate end datetime from start datetime and duration.
         * @param {string} startDateTime - ISO datetime string
         * @param {number} durationMinutes - Duration in minutes
         * @returns {string} ISO datetime string for end
         */
        calculateEndDateTime(startDateTime, durationMinutes) {
            if (!startDateTime || durationMinutes === undefined) {
                return this.getDateTimeWithOffset(30);
            }
            const start = new Date(startDateTime);
            start.setMinutes(start.getMinutes() + durationMinutes);
            return start.toISOString().replace(/\.\d{3}Z$/, 'Z');
        },

        /* =========================================================================
         * MODEL UPDATE HANDLERS
         * Used by controller event handlers
         * ========================================================================= */

        /**
         * Handle duration change - updates end datetime in model.
         * @param {sap.ui.model.json.JSONModel} oModel - Dialog model
         * @param {string} sPath - Entry path in model
         * @param {number} iDuration - New duration value
         * @param {string} sStartField - Start datetime field name
         * @param {string} sEndField - End datetime field name
         * @returns {string|null} New end datetime or null
         */
        handleDurationChange(oModel, sPath, iDuration, sStartField, sEndField) {
            const sStartDateTime = oModel.getProperty(sPath + "/" + sStartField);

            if (sStartDateTime && iDuration >= 0) {
                const sEndDateTime = this.calculateEndDateTime(sStartDateTime, iDuration);
                oModel.setProperty(sPath + "/" + sEndField, sEndDateTime);
                return sEndDateTime;
            }
            return null;
        },

        /**
         * Handle start datetime change - updates end datetime based on duration.
         * @param {sap.ui.model.json.JSONModel} oModel - Dialog model
         * @param {string} sPath - Entry path in model
         * @param {string} sStartField - Start datetime field name
         * @param {string} sDurationField - Duration field name
         * @param {string} sEndField - End datetime field name
         * @param {number} [iDefaultDuration=30] - Default duration if not set
         * @returns {string|null} New end datetime or null
         */
        handleStartDateTimeChange(oModel, sPath, sStartField, sDurationField, sEndField, iDefaultDuration) {
            const sStartDateTime = oModel.getProperty(sPath + "/" + sStartField);
            const iDuration = oModel.getProperty(sPath + "/" + sDurationField) || iDefaultDuration || 30;

            if (sStartDateTime) {
                const sEndDateTime = this.calculateEndDateTime(sStartDateTime, iDuration);
                oModel.setProperty(sPath + "/" + sEndField, sEndDateTime);
                return sEndDateTime;
            }
            return null;
        }
    };
});