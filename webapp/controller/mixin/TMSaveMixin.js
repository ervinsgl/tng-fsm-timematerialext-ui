/**
 * TMSaveMixin.js
 * 
 * Mixin for saving all T&M entries (Material + Time).
 * Handles multi-technician and repeat date expansion.
 * 
 * @file TMSaveMixin.js
 * @module com/tns/fsm/timematerialext/app/controller/mixin/TMSaveMixin
 */
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "com/tns/fsm/timematerialext/app/utils/tm/TMPayloadService",
    "com/tns/fsm/timematerialext/app/utils/tm/TMDataService",
    "com/tns/fsm/timematerialext/app/utils/services/TimeTaskService"
], (MessageToast, MessageBox, TMPayloadService, TMDataService, TimeTaskService) => {
    "use strict";

    return {

        /* ========================================
         * SAVE ALL TIME & MATERIAL ENTRIES
         * ======================================== */

        /**
         * Save all Time & Material entries with confirmation
         */
        onSaveAllCreateTM() {
            const oModel = this._tmCreateDialog.getModel("createTM");
            const aMaterialEntries = oModel.getProperty("/materialEntries") || [];
            const aTimeEntriesAZ = oModel.getProperty("/timeEntriesAZ") || [];
            const aTimeEntriesFZ = oModel.getProperty("/timeEntriesFZ") || [];
            const aTimeEntriesWZ = oModel.getProperty("/timeEntriesWZ") || [];
            
            const totalEntries = aMaterialEntries.length + aTimeEntriesAZ.length + 
                                 aTimeEntriesFZ.length + aTimeEntriesWZ.length;
            
            if (totalEntries === 0) {
                MessageToast.show(this._getText("msgNoEntriesToSave"));
                return;
            }
            
            // Validate entries
            let hasErrors = false;
            let errorMessages = [];
            
            // Validate no future dates across all entries — blocks everything if any entry is faulty
            const allTimeEntries = [...aTimeEntriesAZ, ...aTimeEntriesFZ, ...aTimeEntriesWZ];
            const allEntries = [...aMaterialEntries, ...allTimeEntries];
            if (this._validateNoFutureDates(allEntries, (entry, index) => {
                const type = entry.type || (index < aMaterialEntries.length ? "Material" : "Time Entry");
                const desc = entry.itemDisplay || entry.taskDisplay || entry.technicianDisplay || "";
                return `${this._getText("msgEntryNumber")} ${index + 1} (${type}${desc ? " - " + desc : ""})`;
            })) return;

            allTimeEntries.forEach(entry => {
                if (!entry.taskCode) {
                    hasErrors = true;
                    errorMessages.push("task");
                }
                const selectedTechs = entry.selectedTechnicians || [];
                if (selectedTechs.length === 0) {
                    hasErrors = true;
                    errorMessages.push("technician");
                }
            });
            
            if (hasErrors) {
                const uniqueErrors = [...new Set(errorMessages)];
                MessageBox.warning(this._getText("msgSelectTaskAndTechnician", [uniqueErrors.join(' and ')]));
                return;
            }
            
            // Calculate total API calls (technicians × dates)
            const countEntriesWithTechniciansAndRepeats = (entries) => {
                return entries.reduce((sum, e) => {
                    const techCount = (e.selectedTechnicians || []).length || 1;
                    let dateCount = 1;
                    if (e.repeatEnabled && e.repeatEndDate && e.entryDate) {
                        const dates = this._generateDateRange(e.entryDate, e.repeatEndDate);
                        dateCount = dates.length;
                    }
                    return sum + (techCount * dateCount);
                }, 0);
            };
            
            const totalAPIEntries = aMaterialEntries.length + 
                countEntriesWithTechniciansAndRepeats(aTimeEntriesAZ) + 
                countEntriesWithTechniciansAndRepeats(aTimeEntriesFZ) + 
                countEntriesWithTechniciansAndRepeats(aTimeEntriesWZ);
            
            // Build preview
            const lines = [];
            
            if (aMaterialEntries.length > 0) {
                lines.push(this._getText("previewMaterials", [aMaterialEntries.length]));
                aMaterialEntries.forEach((e, i) => {
                    lines.push(`  ${i + 1}. ${e.itemDisplay || 'N/A'} - ${this._getText("previewQty")} ${e.quantity}`);
                });
            }
            
            if (aTimeEntriesAZ.length > 0) {
                const azCount = countEntriesWithTechniciansAndRepeats(aTimeEntriesAZ);
                lines.push(`\n${this._getText("previewArbeitszeitSection", [azCount])}`);
                aTimeEntriesAZ.forEach((e, i) => {
                    const taskName = this._getTaskNameByCode(oModel, 'AZ', e.taskCode);
                    const techCount = (e.selectedTechnicians || []).length;
                    const techNote = techCount > 1 ? ` ${this._getText("previewTechsMultiplier", [techCount])}` : '';
                    let repeatNote = '';
                    if (e.repeatEnabled && e.repeatEndDate) {
                        const dates = this._generateDateRange(e.entryDate, e.repeatEndDate);
                        repeatNote = ` ${this._getText("previewDaysMultiplier", [dates.length])}`;
                    }
                    lines.push(`  ${i + 1}. ${taskName} - ${e.durationHrs} ${this._getText("unitHours")}${techNote}${repeatNote}`);
                });
            }
            
            if (aTimeEntriesFZ.length > 0) {
                const fzCount = countEntriesWithTechniciansAndRepeats(aTimeEntriesFZ);
                lines.push(`\n${this._getText("previewFahrzeitSection", [fzCount])}`);
                aTimeEntriesFZ.forEach((e, i) => {
                    const taskName = this._getTaskNameByCode(oModel, 'FZ', e.taskCode);
                    const techCount = (e.selectedTechnicians || []).length;
                    const techNote = techCount > 1 ? ` ${this._getText("previewTechsMultiplier", [techCount])}` : '';
                    let repeatNote = '';
                    if (e.repeatEnabled && e.repeatEndDate) {
                        const dates = this._generateDateRange(e.entryDate, e.repeatEndDate);
                        repeatNote = ` ${this._getText("previewDaysMultiplier", [dates.length])}`;
                    }
                    lines.push(`  ${i + 1}. ${taskName} - ${e.durationHrs} ${this._getText("unitHours")}${techNote}${repeatNote}`);
                });
            }
            
            if (aTimeEntriesWZ.length > 0) {
                const wzCount = countEntriesWithTechniciansAndRepeats(aTimeEntriesWZ);
                lines.push(`\n${this._getText("previewWartezeitSection", [wzCount])}`);
                aTimeEntriesWZ.forEach((e, i) => {
                    const taskName = this._getTaskNameByCode(oModel, 'WZ', e.taskCode);
                    const techCount = (e.selectedTechnicians || []).length;
                    const techNote = techCount > 1 ? ` ${this._getText("previewTechsMultiplier", [techCount])}` : '';
                    let repeatNote = '';
                    if (e.repeatEnabled && e.repeatEndDate) {
                        const dates = this._generateDateRange(e.entryDate, e.repeatEndDate);
                        repeatNote = ` ${this._getText("previewDaysMultiplier", [dates.length])}`;
                    }
                    lines.push(`  ${i + 1}. ${taskName} - ${e.durationHrs} ${this._getText("unitHours")}${techNote}${repeatNote}`);
                });
            }
            
            MessageBox.confirm(
                this._getText("msgConfirmCreateTM", [totalAPIEntries, lines.join('\n')]),
                {
                    title: this._getText("msgConfirmCreateTMTitle"),
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._submitCreateTMEntries(aMaterialEntries, aTimeEntriesAZ, aTimeEntriesFZ, aTimeEntriesWZ, oModel);
                        }
                    }
                }
            );
        },

        /**
         * Get task name by code from suggestions
         * @private
         */
        _getTaskNameByCode(oModel, sType, sCode) {
            if (!sCode) return 'N/A';
            const aSuggestions = oModel.getProperty(`/taskSuggestions${sType}`) || [];
            const oTask = aSuggestions.find(t => t.code === sCode);
            return oTask ? oTask.name : sCode;
        },

        /**
         * Submit all Time & Material entries to backend
         * @private
         */
        async _submitCreateTMEntries(aMaterialEntries, aTimeEntriesAZ, aTimeEntriesFZ, aTimeEntriesWZ, oModel) {
            try {
                sap.ui.core.BusyIndicator.show(0);
                
                const activityId = oModel.getProperty("/activityId");
                const orgLevelId = oModel.getProperty("/orgLevelId");
                
                // Helper to expand entries with multiple technicians AND repeat dates.
                // Every resulting row is independent: its time block always starts at the
                // planned start time-of-day on its own date and lasts its own duration.
                // No sequential chaining, no parallel-group handling.
                const expandMultiTechnicianEntries = (entries, typeOrder, timeType) => {
                    const expanded = [];
                    (entries || []).forEach(entry => {
                        const selectedTechnicians = entry.selectedTechnicians || [];
                        
                        // Generate date range if repeat enabled
                        let datesToProcess = [entry.entryDate];
                        if (entry.repeatEnabled && entry.repeatEndDate && entry.entryDate) {
                            datesToProcess = this._generateDateRange(entry.entryDate, entry.repeatEndDate);
                        }
                        
                        if (selectedTechnicians.length > 0) {
                            // One entry per technician per date
                            datesToProcess.forEach(dateStr => {
                                selectedTechnicians.forEach(tech => {
                                    expanded.push({
                                        ...entry,
                                        typeOrder,
                                        timeType,
                                        entryDate: dateStr,
                                        technicianId: tech.id,
                                        technicianExternalId: tech.externalId,
                                        technicianDisplay: tech.displayText
                                    });
                                });
                            });
                        } else if (entry.technicianExternalId) {
                            datesToProcess.forEach(dateStr => {
                                expanded.push({ 
                                    ...entry, 
                                    typeOrder, 
                                    timeType,
                                    entryDate: dateStr
                                });
                            });
                        }
                    });
                    return expanded;
                };
                
                // Combine all time entries
                const allTimeEntries = [
                    ...expandMultiTechnicianEntries(aTimeEntriesAZ, 1, 'AZ'),
                    ...expandMultiTechnicianEntries(aTimeEntriesFZ, 2, 'FZ'),
                    ...expandMultiTechnicianEntries(aTimeEntriesWZ, 3, 'WZ')
                ];
                
                // Sort by date, then type order (AZ, FZ, WZ) for a tidy batch order.
                allTimeEntries.sort((a, b) => {
                    const dateA = TMPayloadService._normalizeDate(a.entryDate) || a.entryDate || '';
                    const dateB = TMPayloadService._normalizeDate(b.entryDate) || b.entryDate || '';
                    if (dateA !== dateB) return dateA.localeCompare(dateB);
                    return a.typeOrder - b.typeOrder;
                });
                
                // Build batch entries array
                const batchEntries = [];
                
                // Add Material entries
                for (const entry of aMaterialEntries) {
                    batchEntries.push({
                        type: 'Material',
                        payload: TMPayloadService.buildPayload({
                            type: "Material",
                            technicianId: entry.technicianId,
                            technicianExternalId: entry.technicianExternalId,
                            itemId: entry.itemId,
                            itemExternalId: entry.itemExternalId,
                            itemDisplay: entry.itemDisplay,
                            quantity: entry.quantity,
                            entryDate: entry.entryDate,
                            remarks: entry.remarks
                        }, activityId, orgLevelId)
                    });
                }
                
                // Build Time Effort entries — every entry starts at 00:01 on its own date.
                //
                // Why 00:01 (and not the planned start time): FSM stores each time effort
                // against startDateTimeTimeZoneId "Europe/Berlin" and validates the LOCAL
                // date against "today". Some activities have a planned start late in the
                // evening (e.g. 23:00 local); start + duration then crosses midnight into
                // the next (future) day, tripping FSM's CA-238 "date must not be in the
                // future" check. Anchoring every entry at 00:01 local keeps the whole block
                // (00:01 + duration) inside the entry's own date for any realistic duration.
                //
                // Because FSM interprets startDateTime in Berlin local time, we must send
                // the UTC instant that equals 00:01 Berlin on that date. Berlin is UTC+1 in
                // winter and UTC+2 in summer (DST), so the correct UTC instant is 23:01Z or
                // 22:01Z of the PREVIOUS day respectively. berlinLocalToUtc() computes this
                // per-date so DST is always handled correctly.
                const formatDateTime = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

                for (const entry of allTimeEntries) {
                    // Normalize date — handles both yyyy-MM-dd and dd.MM.yyyy from manual typing
                    const fallbackDate = (oModel.getProperty("/plannedStartDate") || new Date().toISOString()).split('T')[0];
                    const rawDate = entry.entryDate || fallbackDate;
                    const entryDateStr = TMPayloadService._normalizeDate(rawDate) || fallbackDate;
                    const durationMinutes = Math.round((entry.durationHrs || 0) * 60);

                    // Start = 00:01 Berlin local time on the entry's date, as a UTC instant.
                    const startTime = this._berlinLocalToUtc(entryDateStr, 0, 1);

                    batchEntries.push({
                        type: 'TimeEffort',
                        payload: TMPayloadService.buildPayload({
                            type: "Time Effort",
                            technicianId: entry.technicianId,
                            technicianExternalId: entry.technicianExternalId,
                            taskCode: entry.taskCode,
                            startDateTime: formatDateTime(startTime),
                            duration: durationMinutes,
                            remarks: entry.remarks
                        }, activityId, orgLevelId)
                    });
                }
                
                // Skip if no entries to create
                if (batchEntries.length === 0) {
                    MessageToast.show(this._getText("msgNoEntriesToCreate"));
                    return;
                }
                
                // Chunk the batch so no single request exceeds body-size limits
                // (Express body-parser, approuter, CF router, corporate proxy).
                // Chunks are sent sequentially; a failed chunk does NOT abort the
                // rest — we attempt all chunks and report failures at the end.
                const CHUNK_SIZE = 50;
                let totalSuccess = 0;
                let totalError = 0;
                const failedEntries = []; // { globalIndex, type, reason }

                for (let chunkStart = 0; chunkStart < batchEntries.length; chunkStart += CHUNK_SIZE) {
                    const chunk = batchEntries.slice(chunkStart, chunkStart + CHUNK_SIZE);

                    let result;
                    try {
                        const response = await fetch('/api/v1/batch-create', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ entries: chunk, transactional: false })
                        });

                        // Guard: server/proxy may return non-JSON (e.g. HTML 413/502).
                        // Blindly calling response.json() on HTML throws the confusing
                        // "Unexpected token '<'" error. Detect and handle explicitly.
                        const contentType = response.headers.get("content-type") || "";
                        const isJson = contentType.indexOf("application/json") !== -1;

                        if (!response.ok || !isJson) {
                            // Whole chunk failed at transport level — no per-entry detail available.
                            const reason = response.status === 413
                                ? this._getText("msgBatchTooLarge")
                                : (response.status + " " + response.statusText);
                            for (let i = 0; i < chunk.length; i++) {
                                totalError++;
                                failedEntries.push({
                                    globalIndex: chunkStart + i,
                                    type: chunk[i].type,
                                    reason
                                });
                            }
                            console.error("Batch chunk failed:", response.status, response.statusText, "isJson:", isJson);
                            continue; // attempt remaining chunks
                        }

                        result = await response.json();
                    } catch (chunkError) {
                        // Network error / JSON parse failure for this chunk — record and continue.
                        console.error("Batch chunk error:", chunkError);
                        for (let i = 0; i < chunk.length; i++) {
                            totalError++;
                            failedEntries.push({
                                globalIndex: chunkStart + i,
                                type: chunk[i].type,
                                reason: chunkError.message
                            });
                        }
                        continue;
                    }

                    // Handler returned JSON. Aggregate counts.
                    totalSuccess += result.successCount || 0;
                    totalError += result.errorCount || 0;

                    // Map per-entry failures back to global index via contentId (reqN, 1-based,
                    // restarts per chunk). results[] order is not guaranteed — key on contentId.
                    if (result.errorCount > 0 && Array.isArray(result.results)) {
                        result.results.forEach(r => {
                            if (r.success) return;
                            let localIndex = -1;
                            if (r.contentId) {
                                const m = String(r.contentId).match(/(\d+)/);
                                if (m) localIndex = parseInt(m[1], 10) - 1;
                            }
                            const globalIndex = localIndex >= 0 ? chunkStart + localIndex : chunkStart;
                            const entry = chunk[localIndex >= 0 ? localIndex : 0];
                            const reason = this._extractBatchErrorReason(r);
                            failedEntries.push({
                                globalIndex,
                                type: entry ? entry.type : "?",
                                reason
                            });
                        });
                    }
                }

                // Refresh reports if anything at all was created
                if (totalSuccess > 0 && activityId) {
                    await this._refreshTMReportsAfterCreate(activityId);
                }

                if (totalError === 0) {
                    // Full success — clear arrays and close dialog
                    MessageToast.show(this._getText("msgEntriesCreated", [totalSuccess]));
                    oModel.setProperty("/materialEntries", []);
                    oModel.setProperty("/timeEntriesAZ", []);
                    oModel.setProperty("/timeEntriesFZ", []);
                    oModel.setProperty("/timeEntriesWZ", []);
                    if (this._tmCreateDialog) {
                        this._tmCreateDialog.close();
                    }
                } else {
                    // Partial or total failure — keep dialog open so the user can retry.
                    // Build a readable list of what failed (cap to avoid a giant dialog).
                    const MAX_LISTED = 15;
                    const lines = failedEntries.slice(0, MAX_LISTED).map(f =>
                        `#${f.globalIndex + 1} (${f.type}): ${f.reason}`
                    );
                    if (failedEntries.length > MAX_LISTED) {
                        lines.push(this._getText("msgAndMoreFailures", [failedEntries.length - MAX_LISTED]));
                    }
                    const detail = lines.join('\n');

                    if (totalSuccess > 0) {
                        MessageBox.warning(
                            this._getText("msgPartialSuccess", [totalSuccess, totalError]) + "\n\n" + detail
                        );
                    } else {
                        MessageBox.error(
                            this._getText("msgBatchCreateFailed") + "\n\n" + detail
                        );
                    }
                }

            } catch (error) {
                console.error("Error creating T&M entries:", error);
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        /* ========================================
         * REFRESH T&M REPORTS AFTER CREATE
         * ======================================== */

        /**
         * Refresh T&M reports in main view after creation
         * @private
         */
        async _refreshTMReportsAfterCreate(activityId) {
            try {
                const oViewModel = this.getView().getModel("view");
                if (!oViewModel) return;
                
                // Find the activity path in the model
                const productGroups = oViewModel.getProperty("/productGroups") || [];
                let activityPath = null;
                
                for (let gi = 0; gi < productGroups.length; gi++) {
                    const activities = productGroups[gi].activities || [];
                    for (let ai = 0; ai < activities.length; ai++) {
                        if (activities[ai].id === activityId) {
                            activityPath = `/productGroups/${gi}/activities/${ai}`;
                            break;
                        }
                    }
                    if (activityPath) break;
                }
                
                if (!activityPath) {
                    console.warn("Activity not found in model:", activityId);
                    return;
                }
                
                // Load fresh T&M data using TMDataService
                const tmData = await TMDataService.loadTMReports(activityId);
                
                // Enrich reports with display names
                if (tmData.reports && tmData.reports.length > 0) {
                    await this._enrichTMReports(tmData.reports);
                }
                
                // Update model using TMDataService method
                TMDataService.updateActivityWithTMData(oViewModel, activityPath, tmData);
                
                // Recalculate all counts (activity + product group totals)
                this._updateTMCounts(oViewModel);
                
                console.log("T&M reports refreshed for activity:", activityId, "Count:", tmData.totalCount);
            } catch (error) {
                console.error("Error refreshing T&M reports:", error);
            }
        },

        /**
         * Update T&M counts in main view (kept for backward compatibility)
         * @private
         */
        _updateMainViewTMCounts(activityId, reports) {
            // This method is now replaced by _refreshTMReportsAfterCreate
            // Keeping for backward compatibility
        },

        /**
         * Convert a wall-clock time in Europe/Berlin to the equivalent UTC Date.
         *
         * FSM interprets time-effort startDateTime in Europe/Berlin (see
         * startDateTimeTimeZoneId in TMPayloadService), so to place an entry at a
         * specific Berlin local time we must send the matching UTC instant. Berlin
         * is UTC+1 in winter and UTC+2 under DST; this resolves the offset for the
         * given date using the Intl API, so DST is always correct without a library.
         *
         * @param {string} dateStr - "yyyy-MM-dd" (the entry's local date)
         * @param {number} hours   - local hour (0-23)
         * @param {number} minutes - local minute (0-59)
         * @returns {Date} UTC Date corresponding to that Berlin wall-clock time
         * @private
         */
        _berlinLocalToUtc(dateStr, hours, minutes) {
            const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
            // First guess: treat the wanted wall-clock as if it were UTC.
            const guess = new Date(Date.UTC(y, m - 1, d, hours, minutes, 0));
            // Determine Berlin's offset (minutes) at that instant by formatting the
            // guess in Berlin and comparing back to UTC.
            const dtf = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Europe/Berlin',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            });
            const parts = {};
            dtf.formatToParts(guess).forEach(p => { parts[p.type] = p.value; });
            // What Berlin clock shows for our UTC guess:
            const asBerlin = Date.UTC(
                parseInt(parts.year, 10),
                parseInt(parts.month, 10) - 1,
                parseInt(parts.day, 10),
                parseInt(parts.hour === '24' ? '0' : parts.hour, 10),
                parseInt(parts.minute, 10),
                parseInt(parts.second, 10)
            );
            // Offset = how far Berlin local is ahead of UTC at this instant.
            const offsetMs = asBerlin - guess.getTime();
            // Subtract the offset so the resulting UTC instant renders as the wanted
            // wall-clock time in Berlin.
            return new Date(guess.getTime() - offsetMs);
        },

        /**
         * Extract a human-readable failure reason from a single batch result entry.
         *
         * FSM wraps the real cause in a nested children[] tree. The top-level
         * message is a generic "CA-10: Object [TIMEEFFORT:...] is not valid.".
         * The actual constraint violation (e.g. "date must not be in the future")
         * lives in the deepest child's `values[0]` / `message`.
         *
         * FSM localizes children[].values[0] to the request's Accept-Language,
         * so when the app runs in DE the child text is already German. For known
         * constraint error codes we also provide an i18n fallback so the message
         * is clean in EN even if the backend returned DE text.
         *
         * @param {Object} r - one entry from result.results[]
         * @returns {string} best available reason text
         * @private
         */
        _extractBatchErrorReason(r) {
            const data = r && r.data;
            if (!data) return "HTTP " + (r ? r.status : "?");

            // Walk to the deepest child (real root cause).
            let node = data;
            let code = node.error || null;
            while (node.children && node.children.length > 0) {
                node = node.children[0];
                code = node.error || code;
            }

            // Prefer an i18n mapping for known constraint codes so the wording
            // matches the app language regardless of what FSM returned.
            const sMappedKey = this._batchErrorI18nKey(code);
            if (sMappedKey) {
                const sText = this._getText(sMappedKey);
                if (sText && sText !== sMappedKey) return sText;
            }

            // Fall back to FSM's own localized text.
            // values[0] is the clean message without the "CA-238:" prefix.
            if (Array.isArray(node.values) && node.values.length > 0 &&
                typeof node.values[0] === "string" && node.values[0].trim()) {
                return node.values[0].trim();
            }
            // Strip the leading "CA-nnn: " code prefix from message if present.
            if (typeof node.message === "string" && node.message.trim()) {
                return node.message.replace(/^CA-\d+:\s*/, "").trim();
            }
            return code || ("HTTP " + r.status);
        },

        /**
         * Map an FSM constraint error code to an i18n key, or null if unknown.
         * @private
         */
        _batchErrorI18nKey(sCode) {
            switch (sCode) {
                case "CA-238": return "msgErrFutureDate";
                default: return null;
            }
        },

        /**
         * Validate that no entry has a future entryDate or repeatEndDate.
         * Handles both yyyy-MM-dd (model format) and dd.MM.yyyy (manual typing).
         * Collects ALL faulty entries and shows which ones are invalid.
         * Shows MessageBox.error and returns true if any future date found — caller should return early.
         * @param {Array} aEntries - Array of entry objects
         * @param {Function} [fnLabel] - Optional fn(entry, index) => string for entry label in error message
         * @returns {boolean} true if future date found
         * @private
         */
        _validateNoFutureDates(aEntries, fnLabel) {
            const now = new Date();
            const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

            // Parse a date string in either yyyy-MM-dd or dd.MM.yyyy or dd.MM.yy as LOCAL midnight
            const parseLocal = (sDate) => {
                if (!sDate) return null;
                // yyyy-MM-dd
                if (/^\d{4}-\d{2}-\d{2}$/.test(sDate)) {
                    const p = sDate.split('-');
                    return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
                }
                // dd.MM.yyyy
                if (/^\d{2}\.\d{2}\.\d{4}$/.test(sDate)) {
                    const p = sDate.split('.');
                    return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
                }
                // dd.MM.yy
                if (/^\d{2}\.\d{2}\.\d{2}$/.test(sDate)) {
                    const p = sDate.split('.');
                    return new Date(2000 + parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
                }
                return null;
            };

            const aFaulty = [];
            aEntries.forEach((entry, index) => {
                const d1 = parseLocal(entry.entryDate);
                const d2 = parseLocal(entry.repeatEndDate);
                if ((d1 && d1 > todayEnd) || (d2 && d2 > todayEnd)) {
                    const sLabel = fnLabel ? fnLabel(entry, index) : `${this._getText("msgEntryNumber")} ${index + 1}`;
                    const sBadDate = (d1 && d1 > todayEnd) ? entry.entryDate : entry.repeatEndDate;
                    aFaulty.push(`${sLabel}: ${sBadDate}`);
                }
            });

            if (aFaulty.length > 0) {
                const sDetails = aFaulty.join('\n');
                MessageBox.error(`${this._getText("msgFutureDateNotAllowed")}\n\n${sDetails}`);
                return true;
            }
            return false;
        }

    };
});