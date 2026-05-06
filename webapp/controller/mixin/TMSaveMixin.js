/**
 * TMSaveMixin.js
 * 
 * Mixin for saving all T&M entries (Material + Time).
 * Handles multi-technician and repeat date expansion.
 * 
 * @file TMSaveMixin.js
 * @module com/tng/fsm/timematerialext/app/controller/mixin/TMSaveMixin
 */
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "com/tng/fsm/timematerialext/app/utils/tm/TMPayloadService",
    "com/tng/fsm/timematerialext/app/utils/tm/TMDataService",
    "com/tng/fsm/timematerialext/app/utils/services/TimeTaskService"
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
                
                // Helper to expand entries with multiple technicians AND repeat dates
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
                
                // Sort by date, then type order
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
                
                // Build Time Effort entries with sequential times per date
                const endTimesByDate = {};
                const activityPlannedStart = oModel.getProperty("/plannedStartDate") || new Date().toISOString();
                const baseTimePortion = activityPlannedStart.split('T')[1] || '12:00:00Z';
                
                for (const entry of allTimeEntries) {
                    // Normalize date — handles both yyyy-MM-dd and dd.MM.yyyy from manual typing
                    const rawDate = entry.entryDate || activityPlannedStart.split('T')[0];
                    const entryDateStr = TMPayloadService._normalizeDate(rawDate) || activityPlannedStart.split('T')[0];
                    
                    // Calculate start time
                    let startTime;
                    if (endTimesByDate[entryDateStr]) {
                        startTime = new Date(endTimesByDate[entryDateStr]);
                    } else {
                        startTime = new Date(`${entryDateStr}T${baseTimePortion}`);
                    }
                    
                    const durationMinutes = Math.round((entry.durationHrs || 0) * 60);
                    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
                    
                    // Store end time for next entry
                    endTimesByDate[entryDateStr] = endTime.toISOString();
                    
                    const formatDateTime = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
                    
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
                
                // Single batch request for all entries
                const response = await fetch('/api/v1/batch-create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ entries: batchEntries, transactional: false })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    MessageToast.show(this._getText("msgEntriesCreated", [result.successCount]));
                    
                    // Clear all arrays
                    oModel.setProperty("/materialEntries", []);
                    oModel.setProperty("/timeEntriesAZ", []);
                    oModel.setProperty("/timeEntriesFZ", []);
                    oModel.setProperty("/timeEntriesWZ", []);
                    
                    // Close the creation dialog
                    if (this._tmCreateDialog) {
                        this._tmCreateDialog.close();
                    }
                    
                    // Refresh T&M reports in main view
                    if (activityId) {
                        await this._refreshTMReportsAfterCreate(activityId);
                    }
                } else if (result.successCount > 0) {
                    MessageBox.warning(this._getText("msgPartialSuccess", [result.successCount, result.errorCount]));
                    if (activityId) {
                        await this._refreshTMReportsAfterCreate(activityId);
                    }
                } else {
                    MessageBox.error(this._getText("msgBatchCreateFailed"));
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