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
 * - Handle model updates for datetime/duration changes
 * - Provide default values for new T&M entries
 * 
 * DateTime Format: ISO 8601 without milliseconds (e.g., "2025-11-28T12:30:00Z")
 * Date Format: yyyy-MM-dd (e.g., "2025-11-28")
 * 
 * @file DateTimeService.js
 * @module com/tns/fsm/timematerialext/app/utils/helpers/DateTimeService
 */
sap.ui.define([], () => {
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
         * TIMEZONE HELPERS (Europe/Berlin)
         * ========================================================================= */

        /**
         * Extract the Europe/Berlin calendar date from an ISO instant.
         *
         * Stored startDateTime / date values are UTC instants that FSM interprets
         * in the company time zone (Europe/Berlin). A naive iso.split('T')[0]
         * returns the UTC date, one day early whenever the Berlin-local time
         * crosses midnight (e.g. a value stored as 22:01Z is 00:01 Berlin the next
         * day). This converts the instant to the Berlin wall-clock date so the
         * displayed date matches FSM Web. Bare "yyyy-MM-dd" is returned unchanged.
         *
         * @param {string} isoDateTime - ISO instant or "yyyy-MM-dd"
         * @returns {string} date in "yyyy-MM-dd" (Berlin), or "" if unparseable
         */
        toBerlinDateString(isoDateTime) {
            if (!isoDateTime) return "";
            // Bare date with no time component: nothing to convert.
            if (/^\d{4}-\d{2}-\d{2}$/.test(isoDateTime)) return isoDateTime;
            const d = new Date(isoDateTime);
            if (isNaN(d.getTime())) return "";
            // en-CA yields yyyy-MM-dd; timeZone pins it to Berlin wall-clock.
            try {
                return new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'Europe/Berlin',
                    year: 'numeric', month: '2-digit', day: '2-digit'
                }).format(d);
            } catch (e) {
                return isoDateTime.split('T')[0];
            }
        },

        /**
         * Convert a Europe/Berlin wall-clock time to the equivalent UTC ISO instant.
         *
         * Mirrors the create-path anchor (TMSaveMixin._berlinLocalToUtc): time
         * efforts anchor to 00:01 Berlin on their own date, and FSM stores them
         * against startDateTimeTimeZoneId "Europe/Berlin". When re-saving an edited
         * entry we must rebuild the instant from the (Berlin) date the same way,
         * NOT by pasting the old UTC time portion onto the new date — that would
         * shift the entry by the Berlin offset (1-2h), rolling the date over near
         * midnight. Resolves DST via Intl, no external library.
         *
         * @param {string} dateStr - "yyyy-MM-dd" (Berlin local date)
         * @param {number} [hours=0]   - Berlin local hour
         * @param {number} [minutes=1] - Berlin local minute
         * @returns {string} UTC ISO instant (no milliseconds), or "" if unparseable
         */
        berlinDateToAnchorUtc(dateStr, hours, minutes) {
            const normalized = this.toBerlinDateString(dateStr) || dateStr;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized || "")) return "";
            const h = (hours === undefined) ? 0 : hours;
            const min = (minutes === undefined) ? 1 : minutes;
            const [y, m, d] = normalized.split('-').map(n => parseInt(n, 10));
            // First guess: treat the wanted wall-clock as if it were UTC.
            const guess = new Date(Date.UTC(y, m - 1, d, h, min, 0));
            const dtf = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Europe/Berlin',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            });
            const parts = {};
            dtf.formatToParts(guess).forEach(p => { parts[p.type] = p.value; });
            const asBerlin = Date.UTC(
                parseInt(parts.year, 10),
                parseInt(parts.month, 10) - 1,
                parseInt(parts.day, 10),
                parseInt(parts.hour === '24' ? '0' : parts.hour, 10),
                parseInt(parts.minute, 10),
                parseInt(parts.second, 10)
            );
            const offsetMs = asBerlin - guess.getTime();
            const utc = new Date(guess.getTime() - offsetMs);
            return utc.toISOString().replace(/\.\d{3}Z$/, 'Z');
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