/**
 * TMDialogMixin.js
 * 
 * Mixin for T&M dialog utility handlers.
 * Contains edit-mode duration change handlers, dialog cancel,
 * activity path resolution, and debug helpers.
 * 
 * Handlers:
 * - onEditDurationChange: Recalculate endDateTime when duration changes in edit mode
 * - onEditMileageDurationChange: Recalculate travelEndDateTime for mileage edits
 * - onCancelCreateTM: Close the T&M creation dialog
 * - _getActivityIdFromPath: Extract activity ID from model path
 * - _showEntryJSON: Debug helper to display entry data as formatted JSON
 * 
 * @file TMDialogMixin.js
 * @module com/tng/fsm/timematerialext/app/controller/mixin/TMDialogMixin
 */
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "com/tng/fsm/timematerialext/app/utils/tm/TMDialogService",
    "com/tng/fsm/timematerialext/app/utils/tm/TMCreationService",
    "com/tng/fsm/timematerialext/app/utils/tm/TMDataService",
    "com/tng/fsm/timematerialext/app/utils/tm/TMEditService",
    "com/tng/fsm/timematerialext/app/utils/helpers/DateTimeService",
    "com/tng/fsm/timematerialext/app/utils/services/UdfMetaService",
    "com/tng/fsm/timematerialext/app/utils/services/ApprovalService",
    "com/tng/fsm/timematerialext/app/utils/services/PersonService",
    "com/tng/fsm/timematerialext/app/utils/services/TimeTaskService",
    "com/tng/fsm/timematerialext/app/utils/services/ItemService",
    "com/tng/fsm/timematerialext/app/utils/services/ExpenseTypeService"
], (MessageToast, MessageBox, TMDialogService, TMCreationService, TMDataService, TMEditService, DateTimeService, UdfMetaService, ApprovalService, PersonService, TimeTaskService, ItemService, ExpenseTypeService) => {
    "use strict";

    return {

        /* ========================================
         * T&M REPORTS ENRICHMENT
         * ======================================== */

        /**
         * Enrich T&M reports with lookup data
         */
        async _enrichTMReports(reports) {
            // Extract person IDs before parallel loading
            const personIds = reports
                .map(r => r.createPerson)
                .filter(id => id && id !== 'N/A');

            // Parallel loading of lookup data
            await Promise.all([
                UdfMetaService.preloadUdfMetaForReports(reports),
                ApprovalService.preloadStatusesForReports(reports),
                personIds.length > 0 ? PersonService.preloadPersonsById(personIds) : Promise.resolve()
            ]);

            reports.forEach(report => {
                report.editMode = false;
                report.expanded = false;
                report.selected = false;
                
                // Approval status - get from ApprovalService cache
                const status = ApprovalService.getStatusById(report.id);
                report.decisionStatus = status || 'PENDING';
                report.decisionStatusState = ApprovalService.getStatusState(report.decisionStatus);
                report.decisionRemarks = ApprovalService.getRemarksById(report.id) || '';
                
                // Technician
                if (report.createPerson) {
                    report.createPersonDisplayText = PersonService.getPersonDisplayTextById(report.createPerson);
                } else {
                    report.createPersonDisplayText = 'N/A';
                }
                
                // Time Effort: task name and date
                if (report.type === "Time Effort" && report.task) {
                    report.taskDisplayText = TimeTaskService.getTaskDisplayTextById(report.task);
                }
                if (report.type === "Time Effort") {
                    const timeDate = report.startDateTime || report.createDateTime;
                    if (timeDate) {
                        report.entryDateFormatted = timeDate.split('T')[0];
                    } else {
                        report.entryDateFormatted = '';
                    }
                }
                
                // Material: item name and date
                if (report.type === "Material" && report.fullData?.item) {
                    report.itemDisplayText = ItemService.getItemDisplayTextById(report.fullData.item);
                }
                if (report.type === "Material") {
                    const matDate = report.date || report.fullData?.date || report.createDateTime;
                    if (matDate) {
                        report.entryDateFormatted = matDate.split('T')[0];
                    } else {
                        report.entryDateFormatted = '';
                    }
                }
                
                // Expense: type name and amounts for table display
                if ((report.type === "Expense" || report.type === "Expense Report")) {
                    if (report.fullData?.type) {
                        report.expenseTypeDisplayText = ExpenseTypeService.getExpenseTypeDisplayTextById(report.fullData.type);
                    } else {
                        report.expenseTypeDisplayText = 'N/A';
                    }
                    
                    // Extract amounts for table display
                    report.externalAmountValue = report.fullData?.externalAmount?.amount || 0;
                    report.internalAmountValue = report.fullData?.internalAmount?.amount || 0;
                    report.currency = report.fullData?.externalAmount?.currency || 'EUR';
                    
                    // Extract date
                    const expDate = report.fullData?.date || report.date || report.createDateTime;
                    if (expDate) {
                        report.entryDateFormatted = expDate.split('T')[0];
                    } else {
                        report.entryDateFormatted = '';
                    }
                }
                
                // Mileage: item name and distance for table display
                if (report.type === "Mileage") {
                    // Extract item from UDF value - find Z_Mileage_MatID UDF
                    // Note: u.meta can be either a string ID (needs lookup) or an object with externalId
                    const matIdUdf = report.fullData?.udfValues?.find(u => {
                        if (!u.meta) return false;
                        
                        // If meta is an object with externalId, use it directly
                        if (typeof u.meta === 'object' && u.meta.externalId) {
                            return u.meta.externalId === 'Z_Mileage_MatID' || u.meta.externalId === 'Z_Mileage_Type';
                        }
                        
                        // Otherwise meta is a string ID, lookup via UdfMetaService
                        const metaId = typeof u.meta === 'string' ? u.meta : (u.meta.id || u.meta.externalId);
                        const externalId = UdfMetaService.getExternalIdById(metaId);
                        return externalId === 'Z_Mileage_MatID' || externalId === 'Z_Mileage_Type';
                    });
                    if (matIdUdf?.value) {
                        // Use correct ItemService functions
                        report.itemDisplayText = ItemService.getItemDisplayTextByExternalId(matIdUdf.value);
                        report.mileageTypeDisplayText = ItemService.getItemNameByExternalId(matIdUdf.value);
                    } else {
                        report.itemDisplayText = 'N/A';
                        report.mileageTypeDisplayText = 'Mileage';
                    }
                    
                    // Extract distance (both for legacy and table binding)
                    report.distance = report.fullData?.distance || 0;
                    report.distanceValue = report.fullData?.distance || 0;
                    report.distanceUnit = report.fullData?.distanceUnit || 'KM';
                    
                    // Calculate duration from travel times (both for legacy and table binding)
                    if (report.fullData?.travelStartDateTime && report.fullData?.travelEndDateTime) {
                        const start = new Date(report.fullData.travelStartDateTime);
                        const end = new Date(report.fullData.travelEndDateTime);
                        report.travelDuration = Math.round((end - start) / (1000 * 60)); // minutes
                        report.travelDurationMinutes = report.travelDuration;
                    } else {
                        report.travelDuration = 0;
                        report.travelDurationMinutes = 0;
                    }
                    
                    // Extract date
                    const mileDate = report.fullData?.date || report.date || report.createDateTime;
                    if (mileDate) {
                        report.entryDateFormatted = mileDate.split('T')[0];
                    } else {
                        report.entryDateFormatted = '';
                    }
                }
                
                // UDF Z_TimeEffort_MatID display
                if (report.fullData?.udfValues) {
                    const matIdUdf = report.fullData.udfValues.find(u => {
                        if (!u.meta) return false;
                        // u.meta can be either a string ID or an object with id/externalId
                        const metaId = typeof u.meta === 'string' ? u.meta : (u.meta.id || u.meta.externalId);
                        const externalId = UdfMetaService.getExternalIdById(metaId);
                        return externalId === 'Z_TimeEffort_MatID';
                    });
                    if (matIdUdf?.value) {
                        // Just display the value - UdfMetaService doesn't store value options
                        report.udfMatIdDisplay = matIdUdf.value;
                    }
                }
                
                // Remarks text for table display
                report.remarksText = report.fullData?.remarks || report.remarks || '';
                
                // Approval status display
                report.approvalStatusDisplay = ApprovalService.getStatusDisplayText(report.syncStatus);
            });

            return reports;
        },

        /**
         * Get activity ID from binding path
         * @private
         */
        _getActivityIdFromPath(sPath, oModel) {
            const match = sPath.match(/\/productGroups\/(\d+)\/activities\/(\d+)/);
            if (match) {
                const groupIndex = parseInt(match[1]);
                const activityIndex = parseInt(match[2]);
                const productGroups = oModel.getProperty("/productGroups") || [];
                const activity = productGroups[groupIndex]?.activities?.[activityIndex];
                return activity?.id || null;
            }
            return null;
        },

        /* ========================================
         * EDIT MODE TOGGLE
         * ======================================== */

        /**
         * Toggle edit mode for a T&M report entry
         */
        async onToggleEditMode(oEvent) {
            const oButton = oEvent.getSource();
            let oContext = oButton.getBindingContext("dialog");
            let oModel;

            if (oContext) {
                oModel = this._tmReportsDialog?.getModel("dialog");
            } else {
                oContext = oButton.getBindingContext("view");
                if (oContext) {
                    oModel = this.getView().getModel("view");
                }
            }

            if (!oContext || !oModel) {
                MessageToast.show(this._getText("msgContextNotAvailable"));
                return;
            }

            const sPath = oContext.getPath();
            const oEntry = oModel.getProperty(sPath);
            const bCurrentEditMode = oEntry.editMode || false;
            const bNewEditMode = !bCurrentEditMode;

            // When entering edit mode, store original values
            if (bNewEditMode) {
                oModel.setProperty(sPath + "/originalValues", {
                    duration: oEntry.duration,
                    durationHrs: oEntry.durationHrs,
                    travelDuration: oEntry.travelDuration,
                    distance: oEntry.distance,
                    quantity: oEntry.quantity,
                    remarks: oEntry.remarks,
                    externalAmountValue: oEntry.externalAmountValue,
                    internalAmountValue: oEntry.internalAmountValue,
                    entryDateFormatted: oEntry.entryDateFormatted
                });
            } else {
                // When exiting edit mode (cancel), restore original values
                const originalValues = oEntry.originalValues;
                if (originalValues) {
                    oModel.setProperty(sPath + "/duration", originalValues.duration);
                    oModel.setProperty(sPath + "/durationHrs", originalValues.durationHrs);
                    oModel.setProperty(sPath + "/travelDuration", originalValues.travelDuration);
                    oModel.setProperty(sPath + "/distance", originalValues.distance);
                    oModel.setProperty(sPath + "/quantity", originalValues.quantity);
                    oModel.setProperty(sPath + "/remarks", originalValues.remarks);
                    oModel.setProperty(sPath + "/externalAmountValue", originalValues.externalAmountValue);
                    oModel.setProperty(sPath + "/internalAmountValue", originalValues.internalAmountValue);
                    oModel.setProperty(sPath + "/entryDateFormatted", originalValues.entryDateFormatted);
                }
            }

            oModel.setProperty(sPath + "/editMode", bNewEditMode);
        },

        /**
         * Handle duration change in edit mode
         */
        onEditDurationChange(oEvent) {
            let oContext = oEvent.getSource().getBindingContext("view");
            let oModel;
            
            if (oContext) {
                oModel = this.getView().getModel("view");
            } else {
                oContext = oEvent.getSource().getBindingContext("dialog");
                if (!oContext) return;
                oModel = this._tmReportsDialog.getModel("dialog");
            }

            const newDuration = oEvent.getParameter("value");
            TMEditService.handleDurationChange(oModel, oContext.getPath(), "TimeEffort", newDuration);
        },

        /**
         * Handle mileage duration change in edit mode
         */
        onEditMileageDurationChange(oEvent) {
            let oContext = oEvent.getSource().getBindingContext("view");
            let oModel;
            
            if (oContext) {
                oModel = this.getView().getModel("view");
            } else {
                oContext = oEvent.getSource().getBindingContext("dialog");
                if (!oContext) return;
                oModel = this._tmReportsDialog.getModel("dialog");
            }

            const newDuration = oEvent.getParameter("value");
            TMEditService.handleDurationChange(oModel, oContext.getPath(), "Mileage", newDuration);
        },

        /* ========================================
         * T&M CREATION DIALOG METHODS
         * ======================================== */

        /**
         * Add new T&M Entry from inline button (main view)
         */
        async onAddNewTMEntry(oEvent) {
            const oButton = oEvent.getSource();
            
            // First try direct binding context
            let oContext = oButton.getBindingContext("view");
            
            // If not found, traverse up the control hierarchy to find activity context
            if (!oContext) {
                let oParent = oButton.getParent();
                while (oParent && !oContext) {
                    oContext = oParent.getBindingContext("view");
                    if (oContext) {
                        const sPath = oContext.getPath();
                        if (sPath && sPath.includes("/activities/")) {
                            break;
                        } else {
                            oContext = null;
                        }
                    }
                    oParent = oParent.getParent ? oParent.getParent() : null;
                }
            }

            if (!oContext) {
                MessageToast.show(this._getText("msgActivityContextNotAvailable"));
                return;
            }

            const oActivity = oContext.getObject();
            
            const activityData = {
                activityId: oActivity.id,
                activityCode: oActivity.code,
                activitySubject: oActivity.subject,
                activityExternalId: oActivity.externalId || 'N/A',
                orgLevelId: oActivity.orgLevelId || null,
                serviceProduct: oActivity.serviceProductDisplayText || 'N/A',
                serviceProductExternalId: oActivity.serviceProductId || null,
                plannedStartDate: oActivity.plannedStartDate || null,
                formattedStartDate: oActivity.formattedStartDate || 'N/A',
                formattedEndDate: oActivity.formattedEndDate || 'N/A',
                formattedDuration: oActivity.formattedDuration || 'N/A',
                itemTypeCode: oActivity.itemTypeCode || 'N/A',
                quantity: oActivity.quantity || 'N/A',
                quantityUoM: oActivity.quantityUoM || 'N/A',
                responsibleExternalId: oActivity.responsibleId || 'N/A',
                tmMaterialQtyReported: oActivity.tmMaterialQtyReported || 0
            };

            if (!activityData.activityCode) {
                MessageToast.show(this._getText("msgActivityInfoNotAvailable"));
                return;
            }

            await TMDialogService.openTMCreationDialog(activityData);
        },

        /**
         * Add new T&M Report - Opens unified creation dialog (legacy, from dialog)
         */
        async onAddTMReport(oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("view");

            const activityData = TMDialogService.extractActivityData(oContext, this._tmReportsDialog);

            if (!activityData.activityCode) {
                MessageToast.show(this._getText("msgActivityInfoNotAvailable"));
                return;
            }

            await TMDialogService.openTMCreationDialog(activityData);
        },

        /**
         * Cancel create T&M dialog
         */
        onCancelCreateTM() {
            TMDialogService.closeTMCreationDialog();
        },

        /**
         * Show entry JSON for debugging
         * @private
         */
        _showEntryJSON(oEntry) {
            const jsonStr = JSON.stringify(oEntry, null, 2);
            MessageBox.information(jsonStr, {
                title: "Entry Data (Debug)"
            });
        }

    };
});