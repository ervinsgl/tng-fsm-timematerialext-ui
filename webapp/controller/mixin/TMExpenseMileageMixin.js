/**
 * TMExpenseMileageMixin.js
 * 
 * Mixin for Expense, Mileage, and Time & Material table-based creation handlers.
 * Handles add/remove/copy rows, save operations, and shared technician search.
 * 
 * Expense Handlers:
 * - onAddExpenseEntry: Open expense creation panel
 * - onAddCreateExpenseRow / onRemoveCreateExpenseRow / onCopyCreateExpenseRow
 * - onCreateExpenseTechnicianSelect: Technician dropdown for expense
 * - onSaveAllCreateExpense: Save all expense rows
 * 
 * Mileage Handlers:
 * - onAddMileageEntry: Open mileage creation panel
 * - onAddCreateMileageRow / onRemoveCreateMileageRow / onCopyCreateMileageRow
 * - onCreateMileageTechnicianSelect: Technician dropdown for mileage
 * - onSaveAllCreateMileage: Save all mileage rows
 * 
 * Time & Material Handler:
 * - onAddTimeAndMaterialEntry: Open T&M panel creation (material + time efforts)
 * 
 * Shared Technician Search (used by Expense & Mileage tables):
 * - onCreateTechnicianLiveChange: Filter technician suggestions
 * - onCreateTechnicianSuggestionSelect: Select technician from suggestions
 * 
 * @file TMExpenseMileageMixin.js
 * @module com/tns/fsm/timematerialext/app/controller/mixin/TMExpenseMileageMixin
 */
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "com/tns/fsm/timematerialext/app/utils/tm/TMCreationService",
    "com/tns/fsm/timematerialext/app/utils/tm/TMPayloadService",
    "com/tns/fsm/timematerialext/app/utils/services/TechnicianService"
], (MessageToast, MessageBox, TMCreationService, TMPayloadService, TechnicianService) => {
    "use strict";

    return {

        /* ========================================
         * ADD ENTRY BUTTONS (CREATE DIALOG)
         * ======================================== */

        onAddExpenseEntry() {
            if (!this._tmCreateDialog) {
                MessageToast.show(this._getText("msgDialogNotInitialized"));
                return;
            }
            
            const oModel = this._tmCreateDialog.getModel("createTM");
            if (!oModel) {
                MessageToast.show(this._getText("msgModelNotInitialized"));
                return;
            }
            
            const aEntries = oModel.getProperty("/entries") || [];
            const defaultTechnician = TMCreationService.getDefaultTechnician();
            
            const newEntry = TMCreationService.createExpenseEntry();
            if (defaultTechnician) {
                newEntry.technicianId = defaultTechnician.id;
                newEntry.technicianExternalId = defaultTechnician.externalId;
                newEntry.technicianDisplay = defaultTechnician.displayText;
            }
            
            aEntries.push(newEntry);
            oModel.setProperty("/entries", aEntries);
            MessageToast.show(this._getText("msgExpenseEntryAdded"));
        },

        onAddMileageEntry() {
            if (!this._tmCreateDialog) {
                MessageToast.show(this._getText("msgDialogNotInitialized"));
                return;
            }
            
            const oModel = this._tmCreateDialog.getModel("createTM");
            if (!oModel) {
                MessageToast.show(this._getText("msgModelNotInitialized"));
                return;
            }
            
            const aEntries = oModel.getProperty("/entries") || [];
            const defaultTechnician = TMCreationService.getDefaultTechnician();
            
            const newEntry = TMCreationService.createMileageEntry();
            if (defaultTechnician) {
                newEntry.technicianId = defaultTechnician.id;
                newEntry.technicianExternalId = defaultTechnician.externalId;
                newEntry.technicianDisplay = defaultTechnician.displayText;
            }
            
            aEntries.push(newEntry);
            oModel.setProperty("/entries", aEntries);
            MessageToast.show(this._getText("msgMileageEntryAdded"));
        },

        onAddTimeAndMaterialEntry() {
            if (!this._tmCreateDialog) {
                MessageToast.show(this._getText("msgDialogNotInitialized"));
                return;
            }
            
            const oModel = this._tmCreateDialog.getModel("createTM");
            if (!oModel) {
                MessageToast.show(this._getText("msgModelNotInitialized"));
                return;
            }
            
            const aEntries = oModel.getProperty("/entries") || [];
            const defaultTechnician = TMCreationService.getDefaultTechnician();
            const defaultItem = TMCreationService.getDefaultItem();
            
            const newEntry = TMCreationService.createTMEntry();
            if (defaultTechnician) {
                newEntry.technicianId = defaultTechnician.id;
                newEntry.technicianExternalId = defaultTechnician.externalId;
                newEntry.technicianDisplay = defaultTechnician.displayText;
            }
            if (defaultItem) {
                newEntry.itemId = defaultItem.id;
                newEntry.itemExternalId = defaultItem.externalId;
                newEntry.itemDisplay = defaultItem.displayText;
            }
            
            aEntries.push(newEntry);
            oModel.setProperty("/entries", aEntries);
            MessageToast.show(this._getText("msgTMEntryAdded"));
        },

        /* ========================================
         * EXPENSE TABLE CREATION HANDLERS
         * ======================================== */

        onAddCreateExpenseRow() {
            const oModel = this._tmCreateDialog?.getModel("createTM");
            if (!oModel) {
                MessageToast.show(this._getText("msgModelNotInitialized"));
                return;
            }
            
            const aExpenseEntries = oModel.getProperty("/expenseEntries") || [];
            const defaultTechId = oModel.getProperty("/defaultTechnicianId") || "";
            const defaultTechDisplay = oModel.getProperty("/defaultTechnicianDisplay") || "";
            const defaultTechExternalId = oModel.getProperty("/defaultTechnicianExternalId") || "";
            const defaultDate = oModel.getProperty("/defaultDate") || "";
            const defaultExpenseTypeId = oModel.getProperty("/defaultExpenseTypeId") || "";
            const defaultExpenseTypeDisplay = oModel.getProperty("/defaultExpenseTypeDisplay") || "";
            
            aExpenseEntries.push({
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                technicianId: defaultTechId,
                technicianExternalId: defaultTechExternalId,
                technicianDisplay: defaultTechDisplay,
                expenseTypeId: defaultExpenseTypeId,
                expenseTypeDisplay: defaultExpenseTypeDisplay,
                externalAmountValue: 0,
                internalAmountValue: 0,
                currency: "EUR",
                entryDate: defaultDate,
                remarks: ""
            });
            
            oModel.setProperty("/expenseEntries", aExpenseEntries);
            oModel.refresh(true);
            MessageToast.show(this._getText("msgExpenseEntryAdded"));
        },

        onRemoveCreateExpenseRow(oEvent) {
            const oContext = oEvent.getSource().getBindingContext("createTM");
            if (!oContext) {
                MessageToast.show(this._getText("msgCouldNotIdentifyEntry"));
                return;
            }
            
            const oModel = this._tmCreateDialog.getModel("createTM");
            const iIndex = parseInt(oContext.getPath().split("/").pop());
            const aExpenseEntries = oModel.getProperty("/expenseEntries") || [];
            
            aExpenseEntries.splice(iIndex, 1);
            oModel.setProperty("/expenseEntries", aExpenseEntries);
            oModel.refresh(true);
            MessageToast.show(this._getText("msgExpenseEntryRemoved"));
        },

        onCopyCreateExpenseRow(oEvent) {
            const oContext = oEvent.getSource().getBindingContext("createTM");
            if (!oContext) {
                MessageToast.show(this._getText("msgCouldNotIdentifyEntry"));
                return;
            }
            
            const oModel = this._tmCreateDialog.getModel("createTM");
            const iIndex = parseInt(oContext.getPath().split("/").pop());
            const aExpenseEntries = oModel.getProperty("/expenseEntries") || [];
            const oOriginal = aExpenseEntries[iIndex];
            
            const oCopy = {
                ...oOriginal,
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9)
            };
            
            aExpenseEntries.splice(iIndex + 1, 0, oCopy);
            oModel.setProperty("/expenseEntries", aExpenseEntries);
            oModel.refresh(true);
            MessageToast.show(this._getText("msgExpenseEntryCopied"));
        },

        /**
         * Handle technician selection in Expense creation table
         */
        onCreateExpenseTechnicianSelect(oEvent) {
            const oSelect = oEvent.getSource();
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const oContext = oSelect.getBindingContext("createTM");
            
            if (!oContext || !oSelectedItem) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            
            // Get selected technician data from the item's binding context
            const oItemContext = oSelectedItem.getBindingContext("createTM");
            if (oItemContext) {
                const oTechnician = oItemContext.getObject();
                oModel.setProperty(sPath + "/technicianId", oTechnician.id);
                oModel.setProperty(sPath + "/technicianExternalId", oTechnician.externalId);
                oModel.setProperty(sPath + "/technicianDisplay", oTechnician.displayText);
            }
        },

        onSaveAllCreateExpense() {
            const oModel = this._tmCreateDialog.getModel("createTM");
            const aExpenseEntries = oModel.getProperty("/expenseEntries") || [];
            
            if (aExpenseEntries.length === 0) {
                MessageToast.show(this._getText("msgNoExpenseEntriesToSave"));
                return;
            }
            
            const invalidEntries = aExpenseEntries.filter(e => !e.expenseTypeId || !e.technicianExternalId);
            if (invalidEntries.length > 0) {
                MessageBox.warning(this._getText("msgSelectExpenseTypeAndTechnician"));
                return;
            }
            
            if (this._validateNoFutureDates(aExpenseEntries, (entry, index) => {
                const desc = entry.expenseTypeDisplay || "";
                return `${this._getText("msgEntryNumber")} ${index + 1}${desc ? " (" + desc + ")" : ""}`;
            })) return;
            
            const lines = aExpenseEntries.map((e, i) => 
                `${i + 1}. ${e.expenseTypeDisplay || 'N/A'} - Ext: ${e.externalAmountValue} EUR`
            );
            
            MessageBox.confirm(
                this._getText("msgConfirmExpenseCreation", [aExpenseEntries.length, lines.join('\n')]),
                {
                    title: this._getText("msgConfirmExpenseCreationTitle"),
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._submitCreateExpenseEntries(aExpenseEntries, oModel);
                        }
                    }
                }
            );
        },

        async _submitCreateExpenseEntries(aEntries, oModel) {
            try {
                sap.ui.core.BusyIndicator.show(0);
                
                const activityId = oModel.getProperty("/activityId");
                const orgLevelId = oModel.getProperty("/orgLevelId");
                
                // Build batch entries array
                const batchEntries = aEntries.map(entry => ({
                    type: 'Expense',
                    payload: TMPayloadService.buildPayload({
                        type: "Expense",
                        technicianId: entry.technicianId,
                        technicianExternalId: entry.technicianExternalId,
                        expenseTypeId: entry.expenseTypeId,
                        externalAmountValue: entry.externalAmountValue,
                        internalAmountValue: entry.internalAmountValue,
                        entryDate: entry.entryDate,
                        remarks: entry.remarks
                    }, activityId, orgLevelId)
                }));
                
                // Single batch request
                const response = await fetch('/api/v1/batch-create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ entries: batchEntries, transactional: false })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    MessageToast.show(this._getText("msgExpenseEntriesCreated", [result.successCount]));
                    oModel.setProperty("/expenseEntries", []);
                    
                    if (this._tmCreateDialog) {
                        this._tmCreateDialog.close();
                    }
                    
                    if (activityId) await this._refreshTMReportsAfterCreate(activityId);
                } else if (result.successCount > 0) {
                    MessageBox.warning(this._getText("msgPartialSuccess", [result.successCount, result.errorCount]));
                    if (activityId) await this._refreshTMReportsAfterCreate(activityId);
                } else {
                    MessageBox.error(this._getText("msgBatchCreateFailed"));
                }
            } catch (error) {
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        /* ========================================
         * MILEAGE TABLE CREATION HANDLERS
         * ======================================== */

        onAddCreateMileageRow() {
            const oModel = this._tmCreateDialog?.getModel("createTM");
            if (!oModel) {
                MessageToast.show(this._getText("msgModelNotInitialized"));
                return;
            }
            
            const aMileageEntries = oModel.getProperty("/mileageEntries") || [];
            const defaultTechId = oModel.getProperty("/defaultTechnicianId") || "";
            const defaultTechDisplay = oModel.getProperty("/defaultTechnicianDisplay") || "";
            const defaultTechExternalId = oModel.getProperty("/defaultTechnicianExternalId") || "";
            const defaultDate = oModel.getProperty("/defaultDate") || "";
            const defaultItemId = oModel.getProperty("/defaultItemId") || "";
            const defaultItemExternalId = oModel.getProperty("/defaultItemExternalId") || "";
            const defaultItemDisplay = oModel.getProperty("/defaultItemDisplay") || "";
            const defaultMileageTypeDisplay = oModel.getProperty("/defaultMileageTypeDisplay") || "";
            // Get activity quantity for default distance
            const activityQuantity = parseFloat(oModel.getProperty("/quantity")) || 0;
            
            aMileageEntries.push({
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                technicianId: defaultTechId,
                technicianExternalId: defaultTechExternalId,
                technicianDisplay: defaultTechDisplay,
                itemId: defaultItemId,
                itemExternalId: defaultItemExternalId,
                itemDisplay: defaultItemDisplay,
                mileageTypeDisplay: defaultMileageTypeDisplay,
                distance: activityQuantity,
                travelDuration: 30,
                entryDate: defaultDate,
                remarks: ""
            });
            
            oModel.setProperty("/mileageEntries", aMileageEntries);
            oModel.refresh(true);
            MessageToast.show(this._getText("msgMileageEntryAdded"));
        },

        onRemoveCreateMileageRow(oEvent) {
            const oContext = oEvent.getSource().getBindingContext("createTM");
            if (!oContext) {
                MessageToast.show(this._getText("msgCouldNotIdentifyEntry"));
                return;
            }
            
            const oModel = this._tmCreateDialog.getModel("createTM");
            const iIndex = parseInt(oContext.getPath().split("/").pop());
            const aMileageEntries = oModel.getProperty("/mileageEntries") || [];
            
            aMileageEntries.splice(iIndex, 1);
            oModel.setProperty("/mileageEntries", aMileageEntries);
            oModel.refresh(true);
            MessageToast.show(this._getText("msgMileageEntryRemoved"));
        },

        onCopyCreateMileageRow(oEvent) {
            const oContext = oEvent.getSource().getBindingContext("createTM");
            if (!oContext) {
                MessageToast.show(this._getText("msgCouldNotIdentifyEntry"));
                return;
            }
            
            const oModel = this._tmCreateDialog.getModel("createTM");
            const iIndex = parseInt(oContext.getPath().split("/").pop());
            const aMileageEntries = oModel.getProperty("/mileageEntries") || [];
            const oOriginal = aMileageEntries[iIndex];
            
            const oCopy = {
                ...oOriginal,
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9)
            };
            
            aMileageEntries.splice(iIndex + 1, 0, oCopy);
            oModel.setProperty("/mileageEntries", aMileageEntries);
            oModel.refresh(true);
            MessageToast.show(this._getText("msgMileageEntryCopied"));
        },

        /**
         * Handle technician selection in Mileage creation table
         */
        onCreateMileageTechnicianSelect(oEvent) {
            const oSelect = oEvent.getSource();
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const oContext = oSelect.getBindingContext("createTM");
            
            if (!oContext || !oSelectedItem) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            
            // Get selected technician data from the item's binding context
            const oItemContext = oSelectedItem.getBindingContext("createTM");
            if (oItemContext) {
                const oTechnician = oItemContext.getObject();
                oModel.setProperty(sPath + "/technicianId", oTechnician.id);
                oModel.setProperty(sPath + "/technicianExternalId", oTechnician.externalId);
                oModel.setProperty(sPath + "/technicianDisplay", oTechnician.displayText);
            }
        },

        onSaveAllCreateMileage() {
            const oModel = this._tmCreateDialog.getModel("createTM");
            const aMileageEntries = oModel.getProperty("/mileageEntries") || [];
            
            if (aMileageEntries.length === 0) {
                MessageToast.show(this._getText("msgNoMileageEntriesToSave"));
                return;
            }
            
            const invalidEntries = aMileageEntries.filter(e => !e.itemId || !e.technicianExternalId);
            if (invalidEntries.length > 0) {
                MessageBox.warning(this._getText("msgSelectItemAndTechnician"));
                return;
            }

            if (this._validateNoFutureDates(aMileageEntries, (entry, index) => {
                const desc = entry.itemDisplay || "";
                return `${this._getText("msgEntryNumber")} ${index + 1}${desc ? " (" + desc + ")" : ""}`;
            })) return;
            
            const lines = aMileageEntries.map((e, i) => 
                `${i + 1}. ${e.itemDisplay || 'N/A'} - ${e.distance} km`
            );
            
            MessageBox.confirm(
                this._getText("msgConfirmMileageCreation", [aMileageEntries.length, lines.join('\n')]),
                {
                    title: this._getText("msgConfirmMileageCreationTitle"),
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._submitCreateMileageEntries(aMileageEntries, oModel);
                        }
                    }
                }
            );
        },

        async _submitCreateMileageEntries(aEntries, oModel) {
            try {
                sap.ui.core.BusyIndicator.show(0);
                
                const activityId = oModel.getProperty("/activityId");
                const orgLevelId = oModel.getProperty("/orgLevelId");
                
                // Build batch entries array
                const batchEntries = aEntries.map(entry => ({
                    type: 'Mileage',
                    payload: TMPayloadService.buildPayload({
                        type: "Mileage",
                        technicianId: entry.technicianId,
                        technicianExternalId: entry.technicianExternalId,
                        itemExternalId: entry.itemExternalId,
                        itemDisplay: entry.itemDisplay,
                        distance: entry.distance,
                        travelDuration: entry.travelDuration,
                        entryDate: entry.entryDate,
                        remarks: entry.remarks
                    }, activityId, orgLevelId)
                }));
                
                // Single batch request
                const response = await fetch('/api/v1/batch-create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ entries: batchEntries, transactional: false })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    MessageToast.show(this._getText("msgMileageEntriesCreated", [result.successCount]));
                    oModel.setProperty("/mileageEntries", []);
                    
                    if (this._tmCreateDialog) {
                        this._tmCreateDialog.close();
                    }
                    
                    if (activityId) await this._refreshTMReportsAfterCreate(activityId);
                } else if (result.successCount > 0) {
                    MessageBox.warning(this._getText("msgPartialSuccess", [result.successCount, result.errorCount]));
                    if (activityId) await this._refreshTMReportsAfterCreate(activityId);
                } else {
                    MessageBox.error(this._getText("msgBatchCreateFailed"));
                }
            } catch (error) {
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        /* ========================================
         * TECHNICIAN LOOKUP HANDLERS
         * ======================================== */

        onCreateTechnicianLiveChange(oEvent) {
            const sValue = oEvent.getParameter("value");
            const oModel = this._tmCreateDialog.getModel("createTM");
            
            if (sValue.length < 2) {
                oModel.setProperty("/technicianSuggestions", []);
                return;
            }
            
            const aSuggestions = TechnicianService.searchTechnicians(sValue);
            oModel.setProperty("/technicianSuggestions", aSuggestions);
        },

        onCreateTechnicianSuggestionSelect(oEvent) {
            const oItem = oEvent.getParameter("selectedItem");
            if (!oItem) return;
            
            const oContext = oEvent.getSource().getBindingContext("createTM");
            if (!oContext) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            const sTechId = oItem.getKey();
            const sTechDisplay = oItem.getText();
            const oTech = TechnicianService.getTechnicianById(sTechId);
            
            oModel.setProperty(sPath + "/technicianId", sTechId);
            oModel.setProperty(sPath + "/technicianDisplay", sTechDisplay);
            oModel.setProperty(sPath + "/technicianExternalId", oTech?.externalId || "");
        }

    };
});