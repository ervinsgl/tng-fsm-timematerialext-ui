/**
 * TMDataService.js
 *
 * Frontend service for loading and managing T&M report data.
 * Handles batch loading and model updates for activity T&M reports.
 *
 * Key Features:
 * - Load T&M reports for single activity
 * - Batch load with chunking and rate limiting
 * - Update activity model with T&M counts
 * - Activity T&M summary totals (Material qty, AZ/FZ/WZ hours) + their colour state
 * - Loading/error state management
 *
 * T&M Report Types:
 * - Time Effort
 * - Material
 * - Expense
 * - Mileage
 *
 * =============================================================================
 * SUMMARY RULES - Material / Arbeitszeit / Fahrzeit / Wartezeit
 * =============================================================================
 *
 * TOTALS
 *   Entries with an EXCLUDED status (currently only DECLINED_CLOSED, shown as
 *   REJECTED in the tables) do NOT contribute to the summary totals. They are
 *   still listed in the tables and still counted in tmReportsCount - only the
 *   summary ignores them.
 *
 * COLOUR (per entry type, first match wins - see resolveSummaryState)
 *   RED    (Error)   at least one entry is CHANGE (FSM: DECLINED)
 *   ORANGE (Warning) at least one entry is PENDING or REVIEW
 *   GREY   (None)    no entries at all, or every entry is REJECTED
 *   GREEN  (Success) everything left - all entries APPROVED (and/or REJECTED)
 *
 *   Only this file decides colours. The view binds the resulting ValueState;
 *   it never looks at statuses itself. To change a rule, change
 *   resolveSummaryState() and nothing else.
 *
 * =============================================================================
 *
 * IMPORTANT - ordering: decisionStatus is not known when loadTMReports() runs;
 * it is attached later by the controller's _enrichTMReports(). That is why
 * updateActivityWithTMData() RECALCULATES the summary from the (by then
 * enriched) reports instead of trusting what was produced during load.
 *
 * @file TMDataService.js
 * @module com/tns/fsm/timematerialext/app/utils/tm/TMDataService
 * @requires com/tns/fsm/timematerialext/app/utils/helpers/ReportedItemsData
 * @requires com/tns/fsm/timematerialext/app/utils/services/TimeTaskService
 */
sap.ui.define([
    "com/tns/fsm/timematerialext/app/utils/helpers/ReportedItemsData",
    "com/tns/fsm/timematerialext/app/utils/services/TimeTaskService"
], (ReportedItemsData, TimeTaskService) => {
    "use strict";

    /**
     * Decision statuses whose entries are ignored by the activity summary
     * (Material / AZ / FZ / WZ) - neither summed nor treated as "open work".
     * DECLINED_CLOSED is displayed as "REJECTED" in the T&M tables.
     * @type {string[]}
     */
    const IGNORED_STATUSES = ["DECLINED_CLOSED"];

    /** Statuses that make a summary metric RED. @type {string[]} */
    const RED_STATUSES = ["DECLINED"];           // displayed as CHANGE

    /** Statuses that make a summary metric ORANGE. @type {string[]} */
    const ORANGE_STATUSES = ["PENDING", "REVIEW"];

    return {
        /**
         * Load T&M reports for a single activity.
         * @param {string} activityId - Activity ID
         * @returns {Promise<{reports: Array, totalCount: number, counts: Object, totals: Object}>} T&M reports with counts
         */
        async loadTMReports(activityId) {
            try {
                const reports = await ReportedItemsData.getReportedItems(activityId);

                // Counts cover ALL entries, including ignored ones - the tables still show them.
                const timeEfforts = reports.filter(r => r.type === "Time Effort");
                const materials = reports.filter(r => r.type === "Material");

                // Recalculated in updateActivityWithTMData() once the reports carry
                // decisionStatus. This first pass keeps the returned object shape stable.
                const totals = this.calculateTotals(reports);

                return {
                    reports,
                    totalCount: reports.length,
                    counts: {
                        timeEffort: timeEfforts.length,
                        material: materials.length,
                        expense: reports.filter(r => r.type === "Expense").length,
                        mileage: reports.filter(r => r.type === "Mileage").length
                    },
                    totals
                };
            } catch (error) {
                console.error("TMDataService: Error loading T&M reports:", error);
                throw error;
            }
        },

        /* =========================================================================
         * SUMMARY CALCULATION
         * ========================================================================= */

        /**
         * Calculate the activity T&M summary from a list of reports.
         *
         * Per entry type (material / az / fz / wz) it produces:
         *   - the total, summed over entries whose status is not in IGNORED_STATUSES
         *   - the colour state, derived from ALL that type's statuses (ignored ones
         *     included, because "every entry is REJECTED" has to stay distinguishable
         *     from "no entries at all"... both are grey, but the rule reads that way)
         *
         * Safe to call before enrichment: reports without decisionStatus are all
         * counted and land in the ORANGE bucket only if their status says so.
         *
         * @param {Array} reports - T&M report objects
         * @returns {{materialQty: number, azHours: number, fzHours: number, wzHours: number,
         *            states: {material: string, az: string, fz: string, wz: string}}}
         */
        calculateTotals(reports) {
            const all = Array.isArray(reports) ? reports : [];

            const statuses = { material: [], az: [], fz: [], wz: [] };
            let materialQty = 0;
            const minutes = { az: 0, fz: 0, wz: 0 };

            all.forEach(report => {
                const status = report.decisionStatus;
                const isIgnored = IGNORED_STATUSES.includes(status);

                if (report.type === "Material") {
                    statuses.material.push(status);
                    if (!isIgnored) {
                        materialQty += parseFloat(report.quantity) || 0;
                    }
                    return;
                }

                if (report.type === "Time Effort") {
                    const bucket = this._resolveTimeBucket(report);
                    if (!bucket) return;

                    statuses[bucket].push(status);
                    if (!isIgnored) {
                        minutes[bucket] += this._getDurationMinutes(report);
                    }
                }
            });

            return {
                materialQty,
                azHours: this._minutesToHours(minutes.az),
                fzHours: this._minutesToHours(minutes.fz),
                wzHours: this._minutesToHours(minutes.wz),
                states: {
                    material: this.resolveSummaryState(statuses.material),
                    az: this.resolveSummaryState(statuses.az),
                    fz: this.resolveSummaryState(statuses.fz),
                    wz: this.resolveSummaryState(statuses.wz)
                }
            };
        },

        /**
         * Colour state for one summary metric, from the statuses of the entries
         * belonging to that metric.
         *
         * THE ONE PLACE WHERE SUMMARY COLOURS ARE DECIDED. First match wins:
         *
         *   RED    any CHANGE (DECLINED)             -> something needs correcting
         *   ORANGE any PENDING or REVIEW             -> still open / not decided
         *   GREY   nothing left after ignoring       -> no entries, or all REJECTED
         *   GREEN  everything else                   -> all APPROVED (and/or REJECTED)
         *
         * @param {Array<string|null>} entryStatuses - decisionStatus of every entry of this type
         * @returns {string} "Error" (red) | "Warning" (orange) | "None" (grey) | "Success" (green)
         */
        resolveSummaryState(entryStatuses) {
            const list = Array.isArray(entryStatuses) ? entryStatuses : [];

            // REJECTED entries are ignored everywhere in the summary.
            const active = list.filter(s => !IGNORED_STATUSES.includes(s));

            if (active.some(s => RED_STATUSES.includes(s))) {
                return "Error";
            }
            if (active.some(s => ORANGE_STATUSES.includes(s))) {
                return "Warning";
            }
            if (active.length === 0) {
                // No entries at all, or every entry was REJECTED.
                return "None";
            }
            // Only APPROVED / APPROVED_CLOSED / CANCELLED are left.
            return "Success";
        },

        /**
         * Map a time effort to its summary bucket via the task code prefix.
         * te.task is a UUID, so the code has to come from TimeTaskService.
         * @param {Object} timeEffort
         * @returns {string|null} "az" | "fz" | "wz" | null
         * @private
         */
        _resolveTimeBucket(timeEffort) {
            const taskObj = TimeTaskService.getTaskById(timeEffort.task);
            const taskCode = taskObj?.code || '';

            if (taskCode.startsWith('AZ')) return 'az';
            if (taskCode.startsWith('FZ')) return 'fz';
            if (taskCode.startsWith('WZ')) return 'wz';
            return null;
        },

        /**
         * Duration of a time effort in minutes, from start/end timestamps.
         * @param {Object} timeEffort
         * @returns {number} minutes (0 when either timestamp is missing)
         * @private
         */
        _getDurationMinutes(timeEffort) {
            if (!timeEffort.startDateTime || !timeEffort.endDateTime) {
                return 0;
            }
            const startTime = new Date(timeEffort.startDateTime);
            const endTime = new Date(timeEffort.endDateTime);
            return Math.round((endTime - startTime) / (1000 * 60));
        },

        /**
         * Minutes to hours, rounded to 2 decimals.
         * @param {number} mins
         * @returns {number}
         * @private
         */
        _minutesToHours(mins) {
            return Math.round(mins / 60 * 100) / 100;
        },

        /* =========================================================================
         * MODEL UPDATE
         * ========================================================================= */

        /**
         * Update activity model with T&M data.
         *
         * The summary is recalculated here rather than taken from tmData.totals:
         * this method runs AFTER _enrichTMReports() has written decisionStatus onto
         * each report, which is what the totals and colour rules need.
         *
         * @param {sap.ui.model.json.JSONModel} model - View model
         * @param {string} activityPath - Path to activity in model
         * @param {Object} tmData - T&M data object from loadTMReports
         */
        updateActivityWithTMData(model, activityPath, tmData) {
            const totals = this.calculateTotals(tmData.reports);

            const updates = {
                [`${activityPath}/tmReports`]: tmData.reports,
                [`${activityPath}/tmReportsCount`]: tmData.totalCount,
                [`${activityPath}/tmReportsLoaded`]: true,
                [`${activityPath}/tmReportsLoading`]: false,
                [`${activityPath}/tmReportsLoadingState`]: 'loaded',
                [`${activityPath}/tmTimeEffortCount`]: tmData.counts.timeEffort,
                [`${activityPath}/tmMaterialCount`]: tmData.counts.material,
                [`${activityPath}/tmExpenseCount`]: tmData.counts.expense,
                [`${activityPath}/tmMileageCount`]: tmData.counts.mileage,
                // Totals for T&M summary (REJECTED entries already filtered out)
                [`${activityPath}/tmMaterialQtyReported`]: totals.materialQty,
                [`${activityPath}/tmAzHoursReported`]: totals.azHours,
                [`${activityPath}/tmFzHoursReported`]: totals.fzHours,
                [`${activityPath}/tmWzHoursReported`]: totals.wzHours,
                // Colour state per entry type - bound by the view (label + number)
                [`${activityPath}/tmMaterialSummaryState`]: totals.states.material,
                [`${activityPath}/tmAzSummaryState`]: totals.states.az,
                [`${activityPath}/tmFzSummaryState`]: totals.states.fz,
                [`${activityPath}/tmWzSummaryState`]: totals.states.wz
            };

            Object.keys(updates).forEach(path => {
                model.setProperty(path, updates[path]);
            });
        },

        /**
         * Recalculate only the summary (totals + colour states) for one activity
         * from the reports already in the model.
         *
         * Use after an in-place change that alters statuses or values without a full
         * reload - e.g. after an inline edit resets CHANGE -> PENDING, or after rows
         * were deleted from the model.
         *
         * @param {sap.ui.model.json.JSONModel} model - View model
         * @param {string} activityPath - Path to activity in model
         */
        refreshActivitySummary(model, activityPath) {
            const reports = model.getProperty(`${activityPath}/tmReports`) || [];
            const totals = this.calculateTotals(reports);

            model.setProperty(`${activityPath}/tmMaterialQtyReported`, totals.materialQty);
            model.setProperty(`${activityPath}/tmAzHoursReported`, totals.azHours);
            model.setProperty(`${activityPath}/tmFzHoursReported`, totals.fzHours);
            model.setProperty(`${activityPath}/tmWzHoursReported`, totals.wzHours);

            model.setProperty(`${activityPath}/tmMaterialSummaryState`, totals.states.material);
            model.setProperty(`${activityPath}/tmAzSummaryState`, totals.states.az);
            model.setProperty(`${activityPath}/tmFzSummaryState`, totals.states.fz);
            model.setProperty(`${activityPath}/tmWzSummaryState`, totals.states.wz);
        },

        /**
         * Set loading state for activity.
         * @param {sap.ui.model.json.JSONModel} model - View model
         * @param {string} activityPath - Path to activity in model
         * @param {boolean} isLoading - Loading state
         */
        setLoadingState(model, activityPath, isLoading) {
            model.setProperty(`${activityPath}/tmReportsLoading`, isLoading);
            model.setProperty(`${activityPath}/tmReportsLoadingState`, isLoading ? 'loading' : 'loaded');
        },

        /**
         * Set error state for activity.
         * @param {sap.ui.model.json.JSONModel} model - View model
         * @param {string} activityPath - Path to activity in model
         */
        setErrorState(model, activityPath) {
            model.setProperty(`${activityPath}/tmReportsLoadingState`, 'error');
            model.setProperty(`${activityPath}/tmReportsLoading`, false);
            model.setProperty(`${activityPath}/tmReportsCount`, 0);
        }
    };
});