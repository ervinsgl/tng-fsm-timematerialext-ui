/**
 * TMDeleteMixin.js
 * 
 * Mixin for deleting selected T&M entries from the table view.
 * Handles confirmation dialog, batch delete API call with CA-27 retry,
 * model cleanup, and count recalculation.
 * 
 * @file TMDeleteMixin.js
 * @module com/tng/fsm/timematerialext/app/controller/mixin/TMDeleteMixin
 */
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], (MessageToast, MessageBox) => {
    "use strict";

    return {

        /* =========================================================================
         * DELETE SELECTED ENTRIES
         * ========================================================================= */

        /**
         * Delete selected T&M entries.
         * Only entries with PENDING or REVIEW status can be deleted.
         * Shows confirmation dialog before deletion.
         * @param {sap.ui.base.Event} oEvent - Button press event
         */
        onDeleteSelectedTM(oEvent) {
            const oModel = this.getView().getModel("view");
            const aProductGroups = oModel.getProperty("/productGroups") || [];
            
            // Collect all selected entries across all activities
            const aSelectedEntries = [];
            
            aProductGroups.forEach((group, groupIndex) => {
                (group.activities || []).forEach((activity, activityIndex) => {
                    (activity.tmReports || []).forEach((report, reportIndex) => {
                        // Only include selected entries with PENDING or REVIEW status
                        if (report.selected && (report.decisionStatus === 'PENDING' || report.decisionStatus === 'REVIEW')) {
                            aSelectedEntries.push({
                                report: report,
                                path: `/productGroups/${groupIndex}/activities/${activityIndex}/tmReports/${reportIndex}`,
                                activityPath: `/productGroups/${groupIndex}/activities/${activityIndex}`
                            });
                        }
                    });
                });
            });
            
            if (aSelectedEntries.length === 0) {
                MessageToast.show(this._getText("msgNoEntriesSelected"));
                return;
            }
            
            // Show confirmation dialog
            const sMessage = this._getText("msgDeleteConfirm", [aSelectedEntries.length]);
            MessageBox.confirm(sMessage, {
                title: this._getText("titleDeleteConfirm"),
                icon: MessageBox.Icon.WARNING,
                actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.DELETE,
                onClose: (sAction) => {
                    if (sAction === MessageBox.Action.DELETE) {
                        this._executeDeleteSelectedTM(oModel, aSelectedEntries);
                    }
                }
            });
        },

        /**
         * Execute batch delete of selected entries.
         * @param {sap.ui.model.json.JSONModel} oModel - View model
         * @param {Array} aSelectedEntries - Array of selected entries with paths
         * @private
         */
        async _executeDeleteSelectedTM(oModel, aSelectedEntries) {
            sap.ui.core.BusyIndicator.show(0);
            
            try {
                // Build entries array for batch delete
                const entries = aSelectedEntries.map(item => {
                    const report = item.report;
                    // Map display type to API type
                    let apiType;
                    switch (report.type) {
                        case 'Time Effort':
                            apiType = 'TimeEffort';
                            break;
                        case 'Material':
                            apiType = 'Material';
                            break;
                        case 'Expense':
                            apiType = 'Expense';
                            break;
                        case 'Mileage':
                            apiType = 'Mileage';
                            break;
                        default:
                            apiType = report.type;
                    }
                    
                    return {
                        type: apiType,
                        id: report.id,
                        lastChanged: report.lastChanged
                    };
                });
                
                // Call batch delete API
                let response = await fetch('/api/v1/batch-delete', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ entries, transactional: false })
                });
                
                let result = await response.json();
                
                // Handle CA-27 (concurrent modification) errors by retrying with updated lastChanged
                if (!result.success && result.results) {
                    const ca27Errors = result.results.filter(r => !r.success && r.data?.error === 'CA-27');
                    if (ca27Errors.length > 0) {
                        console.log("CA-27 detected, retrying with updated lastChanged values");
                        
                        // Update entries with correct lastChanged from error response
                        ca27Errors.forEach(err => {
                            const entryIndex = entries.findIndex(e => e.id === err.data?.values?.[2]);
                            if (entryIndex >= 0 && err.data?.values?.[0]) {
                                entries[entryIndex].lastChanged = err.data.values[0];
                            }
                        });
                        
                        // Retry the delete
                        response = await fetch('/api/v1/batch-delete', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ entries, transactional: false })
                        });
                        
                        result = await response.json();
                    }
                }
                
                if (result.success) {
                    MessageToast.show(this._getText("msgEntriesDeleted", [result.successCount]));
                    
                    // Remove deleted entries from model (in reverse order to maintain indices)
                    const sortedEntries = [...aSelectedEntries].sort((a, b) => {
                        // Sort by path in reverse order so we delete from end first
                        return b.path.localeCompare(a.path);
                    });
                    
                    sortedEntries.forEach(item => {
                        const aReports = oModel.getProperty(item.activityPath + "/tmReports") || [];
                        const reportIndex = aReports.findIndex(r => r.id === item.report.id);
                        if (reportIndex >= 0) {
                            aReports.splice(reportIndex, 1);
                            oModel.setProperty(item.activityPath + "/tmReports", aReports);
                        }
                    });
                    
                    // Update counts
                    this._updateTMCounts(oModel);
                    
                } else if (result.successCount > 0) {
                    MessageBox.warning(this._getText("msgPartialDeleteSuccess", [result.successCount, result.errorCount]));
                    // Reload data to get accurate state
                    this._reloadActivityData();
                } else {
                    MessageBox.error(this._getText("msgBatchDeleteFailed"));
                }
                
            } catch (error) {
                console.error("Error in delete selected:", error);
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        /**
         * Update T&M entry counts after deletion.
         * @param {sap.ui.model.json.JSONModel} oModel - View model
         * @private
         */
        _updateTMCounts(oModel) {
            const aProductGroups = oModel.getProperty("/productGroups") || [];
            
            aProductGroups.forEach((group, groupIndex) => {
                (group.activities || []).forEach((activity, activityIndex) => {
                    const aReports = activity.tmReports || [];
                    const basePath = `/productGroups/${groupIndex}/activities/${activityIndex}`;
                    
                    // Count by type
                    const timeEffortCount = aReports.filter(r => r.type === 'Time Effort').length;
                    const materialCount = aReports.filter(r => r.type === 'Material').length;
                    const expenseCount = aReports.filter(r => r.type === 'Expense').length;
                    const mileageCount = aReports.filter(r => r.type === 'Mileage').length;
                    
                    oModel.setProperty(basePath + "/tmTimeEffortCount", timeEffortCount);
                    oModel.setProperty(basePath + "/tmMaterialCount", materialCount);
                    oModel.setProperty(basePath + "/tmExpenseCount", expenseCount);
                    oModel.setProperty(basePath + "/tmMileageCount", mileageCount);
                    oModel.setProperty(basePath + "/tmReportsCount", aReports.length);
                });
            });
        },

        /**
         * Reload activity data after partial delete.
         * @private
         */
        _reloadActivityData() {
            // Trigger data reload - this will be handled by the main controller
            if (this._loadActivitiesForServiceCall) {
                const oModel = this.getView().getModel("view");
                const serviceCallId = oModel.getProperty("/serviceCallId");
                if (serviceCallId) {
                    this._loadActivitiesForServiceCall(serviceCallId);
                }
            }
        }

    };
});