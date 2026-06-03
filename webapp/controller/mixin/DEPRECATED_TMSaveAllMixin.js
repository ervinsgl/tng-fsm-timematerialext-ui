/**
 * TMSaveAllMixin.js
 * 
 * Mixin for batch saving edited T&M entries from the table view.
 * Handles confirmation dialog, payload building, and batch update API call.
 * 
 * Note: This is different from TMSaveMixin.js which handles saving
 * newly created entries from the create dialog.
 * 
 * @file TMSaveAllMixin.js
 * @module com/tns/fsm/timematerialext/app/controller/mixin/TMSaveAllMixin
 */
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], (MessageToast, MessageBox) => {
    "use strict";

    return {

        /* ========================================
         * SAVE ALL T&M HANDLER
         * ======================================== */

        /**
         * Save all edited T&M entries
         */
        onSaveAllTM(oEvent) {
            const oButton = oEvent.getSource();
            
            const oTable = this._getTableFromToolbarControl(oButton);
            if (!oTable) return;
            
            const oModel = this.getView().getModel("view");
            const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
            if (!oBinding) return;
            
            const aContexts = oBinding.getContexts();
            const aEditedReports = [];
            
            aContexts.forEach(oContext => {
                const oData = oContext.getObject();
                if (oData.editMode) {
                    aEditedReports.push({
                        ...oData,
                        _path: oContext.getPath()
                    });
                }
            });
            
            if (aEditedReports.length === 0) {
                MessageToast.show(this._getText("msgNoEntriesInEditMode"));
                return;
            }
            
            // Validate no future dates — entryDateFormatted is the editable date field
            // Map to entryDate property name so _validateNoFutureDates can find it
            const aMapped = aEditedReports.map(r => ({ entryDate: r.entryDateFormatted, type: r.type, _desc: r.taskDisplayText || r.itemDisplayText || r.expenseTypeDisplayText || r.mileageTypeDisplayText || "" }));
            if (this._validateNoFutureDates(aMapped, (entry, index) => {
                return `${this._getText("msgEntryNumber")} ${index + 1} (${entry.type}${entry._desc ? " - " + entry._desc : ""})`;
            })) return;
            
            // Get activity path and edit mode property for later
            const sActivityPath = this._getActivityPathFromToolbarControl(oButton);
            const sEditModeProp = this._getEditModeProperty(oTable);
            
            // Build preview with user-friendly descriptions
            const lines = [];
            aEditedReports.forEach((report, i) => {
                let description = '';
                switch (report.type) {
                    case 'Time Effort':
                        description = report.taskDisplayText || report.taskCode || 'Time Entry';
                        break;
                    case 'Material':
                        description = report.itemDisplayText || 'Material';
                        break;
                    case 'Expense':
                    case 'Expense Report':
                        description = report.expenseTypeDisplayText || 'Expense';
                        break;
                    case 'Mileage':
                        description = report.mileageTypeDisplayText || report.itemDisplayText || 'Mileage';
                        break;
                    default:
                        description = report.type;
                }
                lines.push(`${i + 1}. ${report.type}: ${description}`);
            });
            
            MessageBox.confirm(
                this._getText("msgConfirmSaveEntries", [aEditedReports.length, lines.join('\n')]),
                {
                    title: this._getText("msgConfirmSaveEntriesTitle"),
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._executeSaveAllTM(oModel, aEditedReports, sActivityPath, sEditModeProp);
                        }
                    }
                }
            );
        },

        /**
         * Execute save all T&M entries
         * @private
         */
        async _executeSaveAllTM(oModel, aEditedReports, sActivityPath, sEditModeProp) {
            try {
                sap.ui.core.BusyIndicator.show(0);
                
                // Build batch entries array
                const batchEntries = [];
                
                for (const report of aEditedReports) {
                    let type, payload;

                    // Normalize entryDateFormatted — handles dd.MM.yyyy from manual typing
                    const normalizeDate = (s) => {
                        if (!s) return s;
                        if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) { const p = s.split('.'); return `${p[2]}-${p[1]}-${p[0]}`; }
                        if (/^\d{2}\.\d{2}\.\d{2}$/.test(s))  { const p = s.split('.'); return `20${p[2]}-${p[1]}-${p[0]}`; }
                        return s;
                    };
                    const entryDate = normalizeDate(report.entryDateFormatted);
                    
                    switch (report.type) {
                        case "Time Effort":
                            type = 'TimeEffort';
                            const durationMinutes = report.durationMinutes || Math.round((report.durationHrs || 0) * 60);
                            payload = { ...report.fullData, remarks: report.remarksText || report.remarks };
                            if (payload.startDateTime) {
                                const startDate = new Date(payload.startDateTime);
                                const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
                                payload.endDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
                            }
                            if (entryDate && payload.startDateTime) {
                                const originalTime = payload.startDateTime.split('T')[1];
                                payload.startDateTime = `${entryDate}T${originalTime}`;
                                const startDate = new Date(payload.startDateTime);
                                const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
                                payload.endDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
                            }
                            break;
                            
                        case "Material":
                            type = 'Material';
                            payload = { ...report.fullData, quantity: report.quantity, remarks: report.remarksText || report.remarks };
                            if (entryDate) {
                                payload.date = entryDate;
                            }
                            break;
                            
                        case "Expense":
                        case "Expense Report":
                            type = 'Expense';
                            payload = {
                                ...report.fullData,
                                externalAmount: { amount: report.externalAmountValue, currency: report.currency || 'EUR' },
                                internalAmount: { amount: report.internalAmountValue, currency: report.currency || 'EUR' },
                                remarks: report.remarksText || report.remarks
                            };
                            break;
                            
                        case "Mileage":
                            type = 'Mileage';
                            payload = { ...report.fullData, distance: report.distanceValue, remarks: report.remarksText || report.remarks };
                            if (payload.travelStartDateTime) {
                                const startDate = new Date(payload.travelStartDateTime);
                                const endDate = new Date(startDate.getTime() + (report.travelDurationMinutes || 0) * 60 * 1000);
                                payload.travelEndDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
                            }
                            break;
                            
                        default:
                            console.warn(`Unknown type: ${report.type}`);
                            continue;
                    }
                    
                    batchEntries.push({
                        type,
                        id: report.id,
                        payload,
                        _path: report._path // Keep path for UI update
                    });
                }
                
                if (batchEntries.length === 0) {
                    MessageToast.show(this._getText("msgNoEntriesToUpdate"));
                    return;
                }
                
                // Single batch request for all updates
                const response = await fetch('/api/v1/batch-update', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        entries: batchEntries.map(e => ({ type: e.type, id: e.id, payload: e.payload })),
                        transactional: false 
                    })
                });
                
                const result = await response.json();
                
                // Update UI based on results
                if (result.results) {
                    result.results.forEach((res, index) => {
                        if (res.success && batchEntries[index]) {
                            oModel.setProperty(batchEntries[index]._path + "/editMode", false);
                        }
                    });
                }
                
                if (result.success) {
                    MessageToast.show(this._getText("msgEntriesSaved", [result.successCount]));
                    // Clear activity-level edit mode based on table type
                    if (sActivityPath && sEditModeProp) {
                        oModel.setProperty(sActivityPath + "/" + sEditModeProp, false);
                    }
                } else if (result.successCount > 0) {
                    MessageBox.warning(this._getText("msgPartialSaveSuccess", [result.successCount, result.errorCount]));
                } else {
                    MessageBox.error(this._getText("msgBatchUpdateFailed"));
                }
                
            } catch (error) {
                console.error("Error in save all:", error);
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        }

    };
});