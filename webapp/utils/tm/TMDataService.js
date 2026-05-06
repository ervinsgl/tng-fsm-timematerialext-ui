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
 * - Loading/error state management
 * 
 * T&M Report Types:
 * - Time Effort
 * - Material
 * - Expense
 * - Mileage
 * 
 * @file TMDataService.js
 * @module com/tng/fsm/timematerialext/app/utils/tm/TMDataService
 * @requires com/tng/fsm/timematerialext/app/utils/helpers/ReportedItemsData
 * @requires com/tng/fsm/timematerialext/app/utils/services/TimeTaskService
 */
sap.ui.define([
    "com/tng/fsm/timematerialext/app/utils/helpers/ReportedItemsData",
    "com/tng/fsm/timematerialext/app/utils/services/TimeTaskService"
], (ReportedItemsData, TimeTaskService) => {
    "use strict";

    return {
        /**
         * Load T&M reports for a single activity.
         * @param {string} activityId - Activity ID
         * @returns {Promise<{reports: Array, totalCount: number, counts: Object}>} T&M reports with counts
         */
        async loadTMReports(activityId) {
            try {
                const reports = await ReportedItemsData.getReportedItems(activityId);

                // Filter by type
                const timeEfforts = reports.filter(r => r.type === "Time Effort");
                const materials = reports.filter(r => r.type === "Material");
                
                // Calculate total material quantity
                const totalMaterialQty = materials.reduce((sum, m) => {
                    const qty = parseFloat(m.quantity) || 0;
                    return sum + qty;
                }, 0);
                
                // Calculate time totals by type (AZ/FZ/WZ)
                // Note: te.task is a UUID, need to get the task code from TimeTaskService
                const timeByType = timeEfforts.reduce((acc, te) => {
                    // Get task code from TimeTaskService (task is UUID)
                    const taskObj = TimeTaskService.getTaskById(te.task);
                    const taskCode = taskObj?.code || '';
                    
                    // Calculate duration from start/end times
                    let durationMins = 0;
                    if (te.startDateTime && te.endDateTime) {
                        const startTime = new Date(te.startDateTime);
                        const endTime = new Date(te.endDateTime);
                        durationMins = Math.round((endTime - startTime) / (1000 * 60));
                    }
                    
                    if (taskCode.startsWith('AZ')) {
                        acc.az += durationMins;
                    } else if (taskCode.startsWith('FZ')) {
                        acc.fz += durationMins;
                    } else if (taskCode.startsWith('WZ')) {
                        acc.wz += durationMins;
                    }
                    return acc;
                }, { az: 0, fz: 0, wz: 0 });
                
                // Convert minutes to hours
                const azHours = Math.round(timeByType.az / 60 * 100) / 100;
                const fzHours = Math.round(timeByType.fz / 60 * 100) / 100;
                const wzHours = Math.round(timeByType.wz / 60 * 100) / 100;

                return {
                    reports,
                    totalCount: reports.length,
                    counts: {
                        timeEffort: timeEfforts.length,
                        material: materials.length,
                        expense: reports.filter(r => r.type === "Expense").length,
                        mileage: reports.filter(r => r.type === "Mileage").length
                    },
                    totals: {
                        materialQty: totalMaterialQty,
                        azHours: azHours,
                        fzHours: fzHours,
                        wzHours: wzHours
                    }
                };
            } catch (error) {
                console.error("TMDataService: Error loading T&M reports:", error);
                throw error;
            }
        },

        /**
         * Update activity model with T&M data.
         * @param {sap.ui.model.json.JSONModel} model - View model
         * @param {string} activityPath - Path to activity in model
         * @param {Object} tmData - T&M data object from loadTMReports
         */
        updateActivityWithTMData(model, activityPath, tmData) {
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
                // New totals for T&M summary
                [`${activityPath}/tmMaterialQtyReported`]: tmData.totals?.materialQty || 0,
                [`${activityPath}/tmAzHoursReported`]: tmData.totals?.azHours || 0,
                [`${activityPath}/tmFzHoursReported`]: tmData.totals?.fzHours || 0,
                [`${activityPath}/tmWzHoursReported`]: tmData.totals?.wzHours || 0
            };

            Object.keys(updates).forEach(path => {
                model.setProperty(path, updates[path]);
            });
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