/**
 * TMEditMixin.js
 * 
 * Mixin for creating and updating individual T&M entries.
 * Handles confirmation dialogs, preview formatting, and API submissions
 * for all four entry types (Expense, Mileage, Material, TimeEffort).
 * 
 * Entry Point:
 * - onSaveEntry: Routes to create or update based on entry ID presence
 * - onCloseEntry: Close entry detail view
 * 
 * Per entry type (create + update):
 * - _showExpenseConfirmation / _showExpenseUpdateConfirmation → _submitExpenseToFSM / _submitExpenseUpdate
 * - _showMileageConfirmation / _showMileageUpdateConfirmation → _submitMileageToFSM / _submitMileageUpdate
 * - _showMaterialUpdateConfirmation → _submitMaterialUpdate
 * - _showTimeEffortUpdateConfirmation → _submitTimeEffortUpdate
 * - _showTimeAndMaterialConfirmation → _submitTimeAndMaterialToFSM
 * 
 * @file TMEditMixin.js
 * @module com/tng/fsm/timematerialext/app/controller/mixin/TMEditMixin
 */
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "com/tng/fsm/timematerialext/app/utils/tm/TMCreationService",
    "com/tng/fsm/timematerialext/app/utils/tm/TMDataService",
    "com/tng/fsm/timematerialext/app/utils/tm/TMPayloadService",
    "com/tng/fsm/timematerialext/app/utils/tm/TMEditService",
    "com/tng/fsm/timematerialext/app/utils/helpers/DateTimeService",
    "com/tng/fsm/timematerialext/app/utils/services/TimeTaskService",
    "com/tng/fsm/timematerialext/app/utils/services/ItemService",
    "com/tng/fsm/timematerialext/app/utils/services/ExpenseTypeService"
], (MessageToast, MessageBox, TMCreationService, TMDataService, TMPayloadService, TMEditService, DateTimeService, TimeTaskService, ItemService, ExpenseTypeService) => {
    "use strict";

    return {

        /* ========================================
         * ENTRY CLOSE/SAVE HANDLERS
         * ======================================== */

        /**
         * Close individual entry (remove from dialog)
         */
        onCloseEntry(oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("createTM");
            
            if (!oContext) {
                MessageToast.show(this._getText("msgEntryContextNotAvailable"));
                return;
            }
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            const aEntries = oModel.getProperty("/entries") || [];
            
            // Extract index from path (e.g., "/entries/0" -> 0)
            const match = sPath.match(/\/entries\/(\d+)/);
            if (match) {
                const iIndex = parseInt(match[1]);
                aEntries.splice(iIndex, 1);
                oModel.setProperty("/entries", aEntries);
                MessageToast.show(this._getText("msgEntryRemoved"));
            }
        },

        /**
         * Save individual entry to FSM
         */
        onSaveEntry(oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("createTM");
            
            if (!oContext) {
                MessageToast.show(this._getText("msgEntryContextNotAvailable"));
                return;
            }
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            const oEntry = oModel.getProperty(sPath);
            
            // Determine entry type and show appropriate confirmation
            switch (oEntry.type) {
                case "Expense":
                    if (oEntry.id && oEntry.id.startsWith && !oEntry.id.startsWith("temp_")) {
                        // Existing entry - update
                        this._showExpenseUpdateConfirmation(oEntry, sPath, oModel);
                    } else {
                        // New entry - create
                        this._showExpenseConfirmation(oEntry, sPath, oModel);
                    }
                    break;
                case "Mileage":
                    if (oEntry.id && oEntry.id.startsWith && !oEntry.id.startsWith("temp_")) {
                        this._showMileageUpdateConfirmation(oEntry, sPath, oModel);
                    } else {
                        this._showMileageConfirmation(oEntry, sPath, oModel);
                    }
                    break;
                case "Material":
                    if (oEntry.id && oEntry.id.startsWith && !oEntry.id.startsWith("temp_")) {
                        this._showMaterialUpdateConfirmation(oEntry, sPath, oModel);
                    } else {
                        MessageToast.show(this._getText("msgMaterialCreationHint"));
                    }
                    break;
                case "Time Effort":
                    if (oEntry.id && oEntry.id.startsWith && !oEntry.id.startsWith("temp_")) {
                        this._showTimeEffortUpdateConfirmation(oEntry, sPath, oModel);
                    } else {
                        MessageToast.show(this._getText("msgTimeEffortCreationHint"));
                    }
                    break;
                case "Time & Material":
                    this._showTimeAndMaterialConfirmation(oEntry, sPath, oModel);
                    break;
                default:
                    MessageToast.show(this._getText("msgSaveNotImplemented", [oEntry.type]));
            }
        },

        /* ========================================
         * EXPENSE ENTRY HANDLERS
         * ======================================== */

        _showExpenseConfirmation(oEntry, sPath, oModel) {
            const activityId = oModel.getProperty("/activityId");
            const activityCode = oModel.getProperty("/activityCode") || oModel.getProperty("/activityExternalId");
            const orgLevelId = oModel.getProperty("/orgLevelId");
            
            const payload = TMPayloadService.buildPayload(oEntry, activityId, orgLevelId);
            const previewText = this._formatExpensePreview(oEntry, payload);
            
            MessageBox.confirm(
                this._getText("msgConfirmCreateExpense", [
                    oEntry.expenseTypeDisplay || 'N/A',
                    oEntry.externalAmountValue || 0,
                    oEntry.technicianDisplay || 'N/A'
                ]) + "\n\n" + previewText,
                {
                    title: this._getText("msgConfirmCreateExpenseTitle"),
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._submitExpenseToFSM(payload, oEntry, sPath, oModel, activityCode);
                        }
                    }
                }
            );
        },

        _formatExpensePreview(oEntry, payload) {
            const lines = [];
            lines.push(`${this._getText("previewType")} ${oEntry.expenseTypeDisplay || 'N/A'}`);
            lines.push(`${this._getText("previewExternalAmount")} ${oEntry.externalAmountValue || 0} EUR`);
            lines.push(`${this._getText("previewInternalAmount")} ${oEntry.internalAmountValue || 0} EUR`);
            lines.push(`${this._getText("previewTechnician")} ${oEntry.technicianDisplay || 'N/A'}`);
            lines.push(`${this._getText("previewDate")} ${payload.date || 'N/A'}`);
            if (oEntry.remarks) {
                lines.push(`${this._getText("previewRemarks")} ${oEntry.remarks}`);
            }
            return lines.join('\n');
        },

        async _submitExpenseToFSM(payload, oEntry, sPath, oModel, activityCode) {
            try {
                sap.ui.core.BusyIndicator.show(0);
                
                const response = await fetch('/api/v1/create-expense', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    MessageToast.show(this._getText("msgExpenseCreated"));
                    
                    // Remove entry from dialog
                    const aEntries = oModel.getProperty("/entries") || [];
                    const match = sPath.match(/\/entries\/(\d+)/);
                    if (match) {
                        const iIndex = parseInt(match[1]);
                        aEntries.splice(iIndex, 1);
                        oModel.setProperty("/entries", aEntries);
                    }
                    
                    // Refresh T&M reports
                    const activityId = oModel.getProperty("/activityId");
                    if (activityId) {
                        await this._refreshTMReportsAfterCreate(activityId);
                    }
                } else {
                    MessageBox.error(this._getText("msgFailedCreateExpense", [result.message || this._getText("msgUnknownError")]));
                }
            } catch (error) {
                console.error("Error creating expense:", error);
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        _showExpenseUpdateConfirmation(oEntry, sPath, oModel) {
            const activityId = oModel.getProperty("/activityId");
            const orgLevelId = oModel.getProperty("/orgLevelId");
            
            const payload = TMPayloadService.buildPayload(oEntry, activityId, orgLevelId);
            const previewText = this._formatExpenseUpdatePreview(oEntry, payload);
            
            MessageBox.confirm(
                this._getText("msgConfirmUpdateExpense", [
                    oEntry.expenseTypeDisplay || 'N/A',
                    oEntry.externalAmountValue || 0
                ]) + "\n\n" + previewText,
                {
                    title: this._getText("msgConfirmUpdateExpenseTitle"),
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._submitExpenseUpdate(oEntry.id, payload, sPath, oModel);
                        }
                    }
                }
            );
        },

        _formatExpenseUpdatePreview(oEntry, payload) {
            const lines = [];
            lines.push(`${this._getText("previewId")} ${oEntry.id}`);
            lines.push(`${this._getText("previewType")} ${oEntry.expenseTypeDisplay || 'N/A'}`);
            lines.push(`${this._getText("previewExternalAmount")} ${oEntry.externalAmountValue || 0} EUR`);
            lines.push(`${this._getText("previewInternalAmount")} ${oEntry.internalAmountValue || 0} EUR`);
            if (oEntry.remarks) {
                lines.push(`${this._getText("previewRemarks")} ${oEntry.remarks}`);
            }
            return lines.join('\n');
        },

        async _submitExpenseUpdate(expenseId, payload, sPath, oModel) {
            try {
                sap.ui.core.BusyIndicator.show(0);
                
                const response = await fetch(`/api/v1/update-expense/${expenseId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    MessageToast.show(this._getText("msgExpenseUpdated"));
                    oModel.setProperty(sPath + "/editMode", false);
                    
                    const activityId = oModel.getProperty("/activityId");
                    if (activityId) {
                        await this._refreshTMReportsAfterCreate(activityId);
                    }
                } else {
                    MessageBox.error(this._getText("msgFailedUpdateExpense", [result.message || this._getText("msgUnknownError")]));
                }
            } catch (error) {
                console.error("Error updating expense:", error);
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        /* ========================================
         * MILEAGE ENTRY HANDLERS
         * ======================================== */

        _showMileageUpdateConfirmation(oEntry, sPath, oModel) {
            const activityId = oModel.getProperty("/activityId");
            const orgLevelId = oModel.getProperty("/orgLevelId");
            
            // Recalculate duration from travelDuration
            const durationMinutes = oEntry.travelDuration || 0;
            
            // Build payload with updated duration
            const payload = {
                ...oEntry.fullData,
                distance: oEntry.distance,
                remarks: oEntry.remarks
            };
            
            // Update travel end time based on new duration
            if (payload.travelStartDateTime) {
                const startDate = new Date(payload.travelStartDateTime);
                const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
                payload.travelEndDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
            }
            
            const previewText = this._formatMileageUpdatePreview(oEntry, payload, durationMinutes);
            
            MessageBox.confirm(
                this._getText("msgConfirmUpdateMileage", [oEntry.distance || 0, durationMinutes]) + "\n\n" + previewText,
                {
                    title: this._getText("msgConfirmUpdateMileageTitle"),
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._submitMileageUpdate(oEntry.id, payload, sPath, oModel);
                        }
                    }
                }
            );
        },

        _formatMileageUpdatePreview(oEntry, payload, durationMinutes) {
            const lines = [];
            lines.push(`${this._getText("previewId")} ${oEntry.id}`);
            lines.push(`${this._getText("previewDistance")} ${oEntry.distance || 0} KM`);
            lines.push(`${this._getText("previewDuration")} ${durationMinutes} min`);
            if (oEntry.remarks) {
                lines.push(`${this._getText("previewRemarks")} ${oEntry.remarks}`);
            }
            return lines.join('\n');
        },

        async _submitMileageUpdate(mileageId, payload, sPath, oModel) {
            try {
                sap.ui.core.BusyIndicator.show(0);
                
                const response = await fetch(`/api/v1/update-mileage/${mileageId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    MessageToast.show(this._getText("msgMileageUpdated"));
                    oModel.setProperty(sPath + "/editMode", false);
                    
                    const activityId = oModel.getProperty("/activityId");
                    if (activityId) {
                        await this._refreshTMReportsAfterCreate(activityId);
                    }
                } else {
                    MessageBox.error(this._getText("msgFailedUpdateMileage", [result.message || this._getText("msgUnknownError")]));
                }
            } catch (error) {
                console.error("Error updating mileage:", error);
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        /* ========================================
         * MATERIAL ENTRY HANDLERS
         * ======================================== */

        _showMaterialUpdateConfirmation(oEntry, sPath, oModel) {
            const payload = {
                ...oEntry.fullData,
                quantity: oEntry.quantity,
                remarks: oEntry.remarks
            };
            
            // Update date if changed
            if (oEntry.entryDateFormatted) {
                payload.date = oEntry.entryDateFormatted;
            }
            
            const previewText = this._formatMaterialUpdatePreview(oEntry, payload);
            
            MessageBox.confirm(
                this._getText("msgConfirmUpdateMaterial", [oEntry.itemDisplayText || 'N/A', oEntry.quantity || 0]) + "\n\n" + previewText,
                {
                    title: this._getText("msgConfirmUpdateMaterialTitle"),
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._submitMaterialUpdate(oEntry.id, payload, sPath, oModel);
                        }
                    }
                }
            );
        },

        _formatMaterialUpdatePreview(oEntry, payload) {
            const lines = [];
            lines.push(`${this._getText("previewId")} ${oEntry.id}`);
            lines.push(`${this._getText("previewItem")} ${oEntry.itemDisplayText || 'N/A'}`);
            lines.push(`${this._getText("previewQuantity")} ${oEntry.quantity || 0}`);
            lines.push(`${this._getText("previewDate")} ${oEntry.entryDateFormatted || 'N/A'}`);
            if (oEntry.remarks) {
                lines.push(`${this._getText("previewRemarks")} ${oEntry.remarks}`);
            }
            return lines.join('\n');
        },

        async _submitMaterialUpdate(materialId, payload, sPath, oModel) {
            try {
                sap.ui.core.BusyIndicator.show(0);
                
                const response = await fetch(`/api/v1/update-material/${materialId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    MessageToast.show(this._getText("msgMaterialUpdated"));
                    oModel.setProperty(sPath + "/editMode", false);
                    
                    const activityId = oModel.getProperty("/activityId");
                    if (activityId) {
                        await this._refreshTMReportsAfterCreate(activityId);
                    }
                } else {
                    MessageBox.error(this._getText("msgFailedUpdateMaterial", [result.message || this._getText("msgUnknownError")]));
                }
            } catch (error) {
                console.error("Error updating material:", error);
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        /* ========================================
         * TIME EFFORT ENTRY HANDLERS
         * ======================================== */

        _showTimeEffortUpdateConfirmation(oEntry, sPath, oModel) {
            // Get duration from durationHrs (in hours) -> convert to minutes
            const durationMinutes = Math.round((oEntry.durationHrs || 0) * 60);
            
            // Build updated payload
            const payload = {
                ...oEntry.fullData,
                remarks: oEntry.remarks
            };
            
            // Update start/end times based on new duration
            if (payload.startDateTime) {
                const startDate = new Date(payload.startDateTime);
                const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
                payload.endDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
            }
            
            // Update date if changed
            if (oEntry.entryDateFormatted && payload.startDateTime) {
                const originalTime = payload.startDateTime.split('T')[1];
                payload.startDateTime = `${oEntry.entryDateFormatted}T${originalTime}`;
                const startDate = new Date(payload.startDateTime);
                const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
                payload.endDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
            }
            
            const previewText = this._formatTimeEffortUpdatePreview(oEntry, payload, durationMinutes);
            
            MessageBox.confirm(
                this._getText("msgConfirmUpdateTimeEffort", [oEntry.taskDisplayText || 'N/A', durationMinutes]) + "\n\n" + previewText,
                {
                    title: this._getText("msgConfirmUpdateTimeEffortTitle"),
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._submitTimeEffortUpdate(oEntry.id, payload, sPath, oModel);
                        }
                    }
                }
            );
        },

        _formatTimeEffortUpdatePreview(oEntry, payload, durationMinutes) {
            const lines = [];
            lines.push(`${this._getText("previewId")} ${oEntry.id}`);
            lines.push(`${this._getText("previewTask")} ${oEntry.taskDisplayText || 'N/A'}`);
            lines.push(`${this._getText("previewDuration")} ${durationMinutes} min (${(durationMinutes / 60).toFixed(2)} ${this._getText("unitHours")})`);
            lines.push(`${this._getText("previewDate")} ${oEntry.entryDateFormatted || 'N/A'}`);
            if (oEntry.remarks) {
                lines.push(`${this._getText("previewRemarks")} ${oEntry.remarks}`);
            }
            return lines.join('\n');
        },

        async _submitTimeEffortUpdate(timeEffortId, payload, sPath, oModel) {
            try {
                sap.ui.core.BusyIndicator.show(0);
                
                const response = await fetch(`/api/v1/update-time-effort/${timeEffortId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    MessageToast.show(this._getText("msgTimeEffortUpdated"));
                    oModel.setProperty(sPath + "/editMode", false);
                    
                    const activityId = oModel.getProperty("/activityId");
                    if (activityId) {
                        await this._refreshTMReportsAfterCreate(activityId);
                    }
                } else {
                    MessageBox.error(this._getText("msgFailedUpdateTimeEffort", [result.message || this._getText("msgUnknownError")]));
                }
            } catch (error) {
                console.error("Error updating time effort:", error);
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        /* ========================================
         * MILEAGE CREATION HANDLERS
         * ======================================== */

        _showMileageConfirmation(oEntry, sPath, oModel) {
            const activityId = oModel.getProperty("/activityId");
            const activityCode = oModel.getProperty("/activityCode") || oModel.getProperty("/activityExternalId");
            const orgLevelId = oModel.getProperty("/orgLevelId");
            
            const payload = TMPayloadService.buildPayload(oEntry, activityId, orgLevelId);
            const previewText = this._formatMileagePreview(oEntry, payload);
            
            MessageBox.confirm(
                this._getText("msgConfirmCreateMileage", [oEntry.itemDisplay || 'N/A', oEntry.distance || 0, oEntry.technicianDisplay || 'N/A']) + "\n\n" + previewText,
                {
                    title: this._getText("msgConfirmCreateMileageTitle"),
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._submitMileageToFSM(payload, oEntry, sPath, oModel, activityCode);
                        }
                    }
                }
            );
        },

        _formatMileagePreview(oEntry, payload) {
            const lines = [];
            lines.push(`${this._getText("previewType")} ${oEntry.itemDisplay || 'N/A'}`);
            lines.push(`${this._getText("previewDistance")} ${oEntry.distance || 0} KM`);
            lines.push(`${this._getText("previewDuration")} ${oEntry.travelDuration || 0} min`);
            lines.push(`${this._getText("previewTechnician")} ${oEntry.technicianDisplay || 'N/A'}`);
            if (oEntry.remarks) {
                lines.push(`${this._getText("previewRemarks")} ${oEntry.remarks}`);
            }
            return lines.join('\n');
        },

        async _submitMileageToFSM(payload, oEntry, sPath, oModel, activityCode) {
            try {
                sap.ui.core.BusyIndicator.show(0);
                
                const response = await fetch('/api/v1/create-mileage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    MessageToast.show(this._getText("msgMileageCreated"));
                    
                    // Remove entry from dialog
                    const aEntries = oModel.getProperty("/entries") || [];
                    const match = sPath.match(/\/entries\/(\d+)/);
                    if (match) {
                        const iIndex = parseInt(match[1]);
                        aEntries.splice(iIndex, 1);
                        oModel.setProperty("/entries", aEntries);
                    }
                    
                    // Refresh T&M reports
                    const activityId = oModel.getProperty("/activityId");
                    if (activityId) {
                        await this._refreshTMReportsAfterCreate(activityId);
                    }
                } else {
                    MessageBox.error(this._getText("msgFailedCreateMileage", [result.message || this._getText("msgUnknownError")]));
                }
            } catch (error) {
                console.error("Error creating mileage:", error);
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        /* ========================================
         * TIME & MATERIAL CREATION HANDLERS
         * ======================================== */

        _showTimeAndMaterialConfirmation(oEntry, sPath, oModel) {
            const activityId = oModel.getProperty("/activityId");
            const activityCode = oModel.getProperty("/activityCode") || oModel.getProperty("/activityExternalId");
            const orgLevelId = oModel.getProperty("/orgLevelId");
            
            // Validate tasks are selected
            const validation = this._validateTimeAndMaterialTasks(oEntry);
            if (!validation.valid) {
                MessageBox.warning(validation.message);
                return;
            }
            
            const payload = TMPayloadService.buildTMPayload(oEntry, activityId, orgLevelId);
            const previewText = this._formatTimeAndMaterialPreview(oEntry, payload);
            
            MessageBox.confirm(
                this._getText("msgConfirmCreateTMEntries") + "\n\n" + previewText,
                {
                    title: this._getText("msgConfirmTMCreationTitle"),
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._submitTimeAndMaterialToFSM(payload, oEntry, sPath, oModel, activityCode);
                        }
                    }
                }
            );
        },

        _validateTimeAndMaterialTasks(oEntry) {
            const errors = [];
            
            if (oEntry.timeEffortsFZ?.length > 0) {
                const missingFZ = oEntry.timeEffortsFZ.some(te => !te.taskCode);
                if (missingFZ) errors.push(this._getText("msgFahrzeitNeedsTask"));
            }
            
            if (oEntry.timeEffortsWZ?.length > 0) {
                const missingWZ = oEntry.timeEffortsWZ.some(te => !te.taskCode);
                if (missingWZ) errors.push(this._getText("msgWartezeitNeedsTask"));
            }
            
            if (oEntry.timeEffortsAZ?.length > 0) {
                const missingAZ = oEntry.timeEffortsAZ.some(te => !te.taskCode);
                if (missingAZ) errors.push(this._getText("msgArbeitszeitNeedsTask"));
            }
            
            if (errors.length > 0) {
                return { valid: false, message: errors.join('\n') };
            }
            
            return { valid: true };
        },

        _formatTimeAndMaterialPreview(oEntry, payload) {
            const lines = [];
            
            // Material
            lines.push(`${this._getText("previewMaterial")} ${oEntry.itemDisplay || 'N/A'}`);
            lines.push(`  ${this._getText("previewQty")} ${oEntry.quantity || 0}`);
            
            // Time efforts
            const fzCount = payload.timeEffortsFZ?.length || 0;
            const wzCount = payload.timeEffortsWZ?.length || 0;
            const azCount = payload.timeEffortsAZ?.length || 0;
            
            if (fzCount > 0) lines.push(this._getText("previewFahrzeitEntries", [fzCount]));
            if (wzCount > 0) lines.push(this._getText("previewWartezeitEntries", [wzCount]));
            if (azCount > 0) lines.push(this._getText("previewArbeitszeitEntries", [azCount]));
            
            lines.push(`\n${this._getText("previewTechnician")} ${oEntry.technicianDisplay || 'N/A'}`);
            
            return lines.join('\n');
        },

        async _submitTimeAndMaterialToFSM(payload, oEntry, sPath, oModel, activityCode) {
            try {
                sap.ui.core.BusyIndicator.show(0);
                
                let successCount = 0;
                let errorCount = 0;
                
                // 1. Create Material
                if (payload.material) {
                    const matResponse = await fetch('/api/v1/create-material', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload.material)
                    });
                    const matResult = await matResponse.json();
                    if (matResult.success) successCount++; else errorCount++;
                }
                
                // 2. Create Time Efforts (FZ)
                for (const te of (payload.timeEffortsFZ || [])) {
                    const teResponse = await fetch('/api/v1/create-time-effort', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(te)
                    });
                    const teResult = await teResponse.json();
                    if (teResult.success) successCount++; else errorCount++;
                }
                
                // 3. Create Time Efforts (WZ)
                for (const te of (payload.timeEffortsWZ || [])) {
                    const teResponse = await fetch('/api/v1/create-time-effort', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(te)
                    });
                    const teResult = await teResponse.json();
                    if (teResult.success) successCount++; else errorCount++;
                }
                
                // 4. Create Time Efforts (AZ)
                for (const te of (payload.timeEffortsAZ || [])) {
                    const teResponse = await fetch('/api/v1/create-time-effort', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(te)
                    });
                    const teResult = await teResponse.json();
                    if (teResult.success) successCount++; else errorCount++;
                }
                
                if (errorCount === 0) {
                    MessageToast.show(this._getText("msgEntriesCreated", [successCount]));
                    
                    // Remove entry from dialog
                    const aEntries = oModel.getProperty("/entries") || [];
                    const match = sPath.match(/\/entries\/(\d+)/);
                    if (match) {
                        const iIndex = parseInt(match[1]);
                        aEntries.splice(iIndex, 1);
                        oModel.setProperty("/entries", aEntries);
                    }
                } else {
                    MessageBox.warning(this._getText("msgPartialSuccess", [successCount, errorCount]));
                }
                
                // Refresh T&M reports
                const activityId = oModel.getProperty("/activityId");
                if (activityId) {
                    await this._refreshTMReportsAfterCreate(activityId);
                }
                
            } catch (error) {
                console.error("Error creating T&M:", error);
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        }

    };
});