/**
 * DataLoadingMixin.js
 * 
 * Mixin containing all data loading and fetching methods.
 * Handles initialization loading, activity loading, and T&M batch loading.
 * 
 * Responsibilities:
 * - Organization level loading and user resolution
 * - Lookup data loading (tasks, items, expense types)
 * - Web container context loading
 * - Activity and service call loading (supports both entry points)
 * - T&M reports batch loading
 * 
 * Entry Points:
 * - Activity: Fetches activity first to get service call ID, then loads service call
 * - ServiceCall: Goes directly to service call API (skips activity fetch)
 * 
 * @file DataLoadingMixin.js
 * @module com/tng/fsm/timematerialext/app/controller/mixin/DataLoadingMixin
 */
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "com/tng/fsm/timematerialext/app/utils/services/OrganizationService",
    "com/tng/fsm/timematerialext/app/utils/services/TimeTaskService",
    "com/tng/fsm/timematerialext/app/utils/services/ItemService",
    "com/tng/fsm/timematerialext/app/utils/services/ExpenseTypeService",
    "com/tng/fsm/timematerialext/app/utils/services/ActivityService",
    "com/tng/fsm/timematerialext/app/utils/services/ServiceOrderService",
    "com/tng/fsm/timematerialext/app/utils/services/PersonService",
    "com/tng/fsm/timematerialext/app/utils/services/BusinessPartnerService",
    "com/tng/fsm/timematerialext/app/utils/services/ApprovalService",
    "com/tng/fsm/timematerialext/app/utils/services/UdfMetaService",
    "com/tng/fsm/timematerialext/app/utils/services/TechnicianService",
    "com/tng/fsm/timematerialext/app/utils/services/ContextService",
    "com/tng/fsm/timematerialext/app/utils/helpers/URLHelper",
    "com/tng/fsm/timematerialext/app/utils/helpers/ProductGroupService",
    "com/tng/fsm/timematerialext/app/utils/tm/TMDataService"
], (MessageToast, MessageBox, OrganizationService, TimeTaskService, ItemService, ExpenseTypeService, ActivityService, ServiceOrderService, PersonService, BusinessPartnerService, ApprovalService, UdfMetaService, TechnicianService, ContextService, URLHelper, ProductGroupService, TMDataService) => {
    "use strict";

    return {

        /* =========================================================================
         * INITIALIZATION LOADING
         * ========================================================================= */

        /**
         * Load organization levels and auto-resolve user's org level
         * @private
         */
        async _loadOrganizationLevels() {
            const viewModel = this.getView().getModel("view");
            viewModel.setProperty("/organizationLevelsLoading", true);

            try {
                await OrganizationService.loadOrganizationalHierarchy();

                const webContext = viewModel.getProperty("/webContainerContext");
                const userName = webContext?.userName;

                if (userName && userName !== 'N/A') {
                    const resolvedOrgLevel = await OrganizationService.getUserResolvedOrgLevel(userName);
                    
                    if (resolvedOrgLevel && resolvedOrgLevel.found) {
                        viewModel.setProperty("/webContainerContext/orgLevelId", resolvedOrgLevel.id);
                        viewModel.setProperty("/webContainerContext/orgLevelName", resolvedOrgLevel.name);
                        viewModel.setProperty("/webContainerContext/personIds", resolvedOrgLevel.personIds || []);
                        viewModel.setProperty("/webContainerContext/personExternalIds", resolvedOrgLevel.personExternalIds || []);
                        viewModel.setProperty("/selectedOrganizationLevel", {
                            key: resolvedOrgLevel.id,
                            text: resolvedOrgLevel.name
                        });
                        viewModel.setProperty("/organizationSelected", true);
                        viewModel.setProperty("/userOrgLevelResolved", true);

                        await this._loadActivityFromURL();
                        return;
                    } else {
                        viewModel.setProperty("/webContainerContext/orgLevelName", "Not Assigned");
                        // Still store person IDs if available (for logging/debugging)
                        if (resolvedOrgLevel) {
                            viewModel.setProperty("/webContainerContext/personIds", resolvedOrgLevel.personIds || []);
                            viewModel.setProperty("/webContainerContext/personExternalIds", resolvedOrgLevel.personExternalIds || []);
                        }
                    }
                } else {
                    viewModel.setProperty("/webContainerContext/orgLevelName", "N/A");
                }

                await this._loadActivityFromURL();

            } catch (error) {
                console.error("Failed to load organization levels:", error);
                viewModel.setProperty("/webContainerContext/orgLevelName", "Error");
            } finally {
                viewModel.setProperty("/organizationLevelsLoading", false);
                viewModel.setProperty("/pageLoading", false);
            }
        },

        /**
         * Load organizational hierarchy for name lookups
         * @private
         */
        async _loadOrganizationalHierarchy() {
            try {
                await OrganizationService.loadOrganizationalHierarchy();
            } catch (error) {
                console.error("Failed to load organizational hierarchy:", error);
            }
        },

        /**
         * Load Time Tasks for lookup
         * @private
         */
        async _loadTimeTasks() {
            try {
                await TimeTaskService.fetchTimeTasks();
            } catch (error) {
                console.error("Failed to load time tasks:", error);
            }
        },

        /**
         * Load Items for lookup
         * @private
         */
        async _loadItems() {
            try {
                await ItemService.fetchItems();
            } catch (error) {
                console.error("Failed to load items:", error);
            }
        },

        /**
         * Load Expense Types for lookup
         * @private
         */
        async _loadExpenseTypes() {
            try {
                await ExpenseTypeService.fetchExpenseTypes();
            } catch (error) {
                console.error("Failed to load expense types:", error);
            }
        },

        /* =========================================================================
         * WEB CONTAINER & URL METHODS
         * ========================================================================= */

        /**
         * Load web container context from FSM Mobile or FSM Shell
         * @private
         */
        async _loadWebContainerContext() {
            const viewModel = this.getView().getModel("view");
            
            try {
                // Get context from ContextService (handles both Mobile and Shell)
                const context = await ContextService.getContext();
                
                if (context && (context.source === 'shell' || context.source === 'mobile')) {
                    // Set UI5 language from context (de, en, etc.)
                    const contextLanguage = context.locale || context.language;
                    if (contextLanguage) {
                        this._setAppLanguage(contextLanguage);
                    }
                    
                    viewModel.setProperty("/webContainerContext", {
                        available: true,
                        userName: context.userName || 'N/A',
                        language: (contextLanguage || 'N/A').toUpperCase(),
                        cloudAccount: context.accountName || context.cloudAccount || 'N/A',
                        companyName: context.companyName || 'N/A',
                        objectType: context.objectType || 'N/A',
                        cloudId: context.objectId || 'N/A',
                        orgLevelId: null,
                        orgLevelName: "Loading...",
                        // Additional Shell context
                        source: context.source,
                        cloudHost: context.cloudHost
                    });
                    
                    URLHelper.setWebContainerContext({
                        userName: context.userName,
                        cloudId: context.objectId,
                        objectType: context.objectType,
                        companyName: context.companyName,
                        cloudAccount: context.accountName
                    });
                    
                    return context;
                }
                
                // URL params or no context - set minimal context
                if (context && context.source === 'url') {
                    viewModel.setProperty("/webContainerContext", {
                        available: false,
                        userName: 'N/A',
                        language: 'N/A',
                        cloudAccount: 'N/A',
                        companyName: 'N/A',
                        objectType: context.objectType || 'N/A',
                        cloudId: context.objectId || 'N/A',
                        orgLevelId: null,
                        orgLevelName: "N/A",
                        source: 'url'
                    });
                    return context;
                }
                
                return null;
            } catch (error) {
                console.error("_loadWebContainerContext error:", error);
                return null;
            }
        },

        /**
         * Set application language based on FSM context
         * @param {string} language - Language code (e.g., 'de', 'en')
         * @private
         */
        _setAppLanguage(language) {
            if (!language) return;
            
            // Normalize language code (e.g., 'de-DE' -> 'de')
            const langCode = language.toLowerCase().split('-')[0].split('_')[0];
            
            // Get current UI5 language
            const currentLang = sap.ui.getCore().getConfiguration().getLanguage();
            const currentLangCode = currentLang.toLowerCase().split('-')[0].split('_')[0];
            
            // Only change if different
            if (langCode !== currentLangCode) {
                console.log(`DataLoadingMixin: Setting language to '${langCode}' (from FSM context)`);
                sap.ui.getCore().getConfiguration().setLanguage(langCode);
            }
        },

        /**
         * Load data from URL parameters or web container context.
         * Handles both Activity and ServiceCall object types.
         * @private
         */
        async _loadFromContext() {
            const contextInfo = await URLHelper.getContextInfo();
            
            if (!contextInfo) {
                return;
            }

            // Store entry context for highlighting and reference
            const viewModel = this.getView().getModel("view");
            viewModel.setProperty("/entryContext", {
                objectType: contextInfo.objectType,
                objectId: contextInfo.objectId,
                source: contextInfo.source
            });

            if (contextInfo.objectType === URLHelper.OBJECT_TYPES.ACTIVITY) {
                await this._loadActivity(contextInfo.objectId);
            } else if (contextInfo.objectType === URLHelper.OBJECT_TYPES.SERVICECALL) {
                await this._loadServiceCallDirect(contextInfo.objectId);
            }
        },

        /**
         * @deprecated Use _loadFromContext instead
         * Load activity from URL parameters or web container context
         * @private
         */
        async _loadActivityFromURL() {
            // Delegate to new method for backward compatibility
            await this._loadFromContext();
        },

        /* =========================================================================
         * ACTIVITY LOADING METHODS
         * ========================================================================= */

        /**
         * Load single activity by ID
         * @private
         */
        async _loadActivity(activityId) {
            const viewModel = this.getView().getModel("view");
            viewModel.setProperty("/busy", true);

            try {
                const response = await ActivityService.fetchActivityById(activityId);
                const activity = ActivityService.extractActivityData(response);
                const serviceCall = ActivityService.extractServiceCallData(activity);

                if (serviceCall) {
                    viewModel.setProperty("/serviceCall", serviceCall);
                    await this._loadServiceCallActivities(serviceCall.id);
                }

                MessageToast.show(this._getText("msgActivityLoaded", [activity.subject]));

            } catch (error) {
                console.error("Load activity error:", error);
                MessageBox.error(this._getText("msgFailedLoadActivity", [error.message]));
            } finally {
                viewModel.setProperty("/busy", false);
            }
        },

        /**
         * Load service call directly (when opened from ServiceCall context).
         * @param {string} serviceCallId - The service call ID
         * @private
         */
        async _loadServiceCallDirect(serviceCallId) {
            const viewModel = this.getView().getModel("view");
            viewModel.setProperty("/busy", true);

            try {
                await this._loadServiceCallActivities(serviceCallId);
                MessageToast.show(this._getText("msgServiceCallLoaded"));

            } catch (error) {
                console.error("Load service call error:", error);
                MessageBox.error(this._getText("msgFailedLoadServiceCall", [error.message]));
            } finally {
                viewModel.setProperty("/busy", false);
            }
        },

        /**
         * Load all activities for a service call
         * @private
         */
        async _loadServiceCallActivities(serviceCallId) {
            const viewModel = this.getView().getModel("view");
            viewModel.setProperty("/activitiesLoading", true);

            try {
                const compositeData = await ServiceOrderService.fetchServiceCallById(serviceCallId);
                const serviceOrderData = ServiceOrderService.extractServiceOrderData(compositeData);
                const allActivities = ServiceOrderService.extractActivitiesFromCompositeTree(compositeData);

                const userOrgLevelId = viewModel.getProperty("/webContainerContext/orgLevelId");
                const userOrgLevelName = viewModel.getProperty("/webContainerContext/orgLevelName");
                const userPersonIds = viewModel.getProperty("/webContainerContext/personIds") || [];
                const userPersonExternalIds = viewModel.getProperty("/webContainerContext/personExternalIds") || [];

                // Filter activities by execution stage:
                // - EXECUTION: Active, can add entries
                // - CLOSED: Read-only, show "Activity Closed"
                // - CANCELLED: Read-only, show "Activity Cancelled"
                let filteredActivities = allActivities.filter(activity =>
                    activity.executionStage === "EXECUTION" || 
                    activity.executionStage === "CLOSED" ||
                    activity.executionStage === "CANCELLED"
                );
                
                const totalVisibleCount = filteredActivities.length;

                // FILTER 1: Organization level (mandatory)
                // If user has no org level resolved → show NO activities
                if (!userOrgLevelId) {
                    filteredActivities = [];
                    viewModel.setProperty("/noActivitiesMessage", {
                        show: true,
                        title: this._getText("msgNoActivitiesNoOrgTitle"),
                        description: this._getText("msgNoActivitiesNoOrgDesc"),
                        type: "warning"
                    });
                } else {
                    // Filter by matching org level
                    filteredActivities = filteredActivities.filter(activity => {
                        const activityOrgLevelIds = activity.orgLevelIds || [];
                        return activityOrgLevelIds.some(activityOrgLevelId => {
                            const formattedActivityOrgLevelId = OrganizationService.formatOrgLevelId(activityOrgLevelId);
                            return formattedActivityOrgLevelId === userOrgLevelId;
                        });
                    });

                    // FILTER 2: User assignment (responsible or supporting technician)
                    if (filteredActivities.length > 0 && (userPersonIds.length > 0 || userPersonExternalIds.length > 0)) {
                        // Phase 1: Check responsible match from composite-tree (no API call)
                        const responsibleActivities = [];
                        const needsSupportCheck = [];

                        filteredActivities.forEach(activity => {
                            const responsibleExternalId = activity.responsibles?.[0]?.externalId;
                            if (responsibleExternalId && userPersonExternalIds.includes(responsibleExternalId)) {
                                responsibleActivities.push(activity);
                            } else {
                                needsSupportCheck.push(activity);
                            }
                        });

                        // Phase 2: For non-responsible activities, check supporting technicians via Data API
                        const supportingActivities = [];
                        if (needsSupportCheck.length > 0 && userPersonIds.length > 0) {
                            const chunkSize = 5;
                            for (let i = 0; i < needsSupportCheck.length; i += chunkSize) {
                                const chunk = needsSupportCheck.slice(i, i + chunkSize);
                                const promises = chunk.map(async (activity) => {
                                    try {
                                        const techData = await ActivityService.fetchActivityTechnicians(activity.id);
                                        const supportingIds = techData.supportingPersonIds || [];
                                        const responsibleIds = techData.responsibleIds || [];
                                        // Check if any of user's person IDs match supporting or responsible
                                        const allActivityPersonIds = [...supportingIds, ...responsibleIds];
                                        const isAssigned = userPersonIds.some(uid => allActivityPersonIds.includes(uid));
                                        if (isAssigned) {
                                            supportingActivities.push(activity);
                                        }
                                    } catch (e) {
                                        console.error('Error checking assignment for activity', activity.id, ':', e);
                                    }
                                });
                                await Promise.allSettled(promises);
                                if (i + chunkSize < needsSupportCheck.length) {
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                }
                            }
                        }

                        filteredActivities = [...responsibleActivities, ...supportingActivities];
                    }
                    
                    // Show info messages about filtering
                    const filteredOutCount = totalVisibleCount - filteredActivities.length;
                    if (filteredOutCount > 0 && filteredActivities.length === 0) {
                        viewModel.setProperty("/noActivitiesMessage", {
                            show: true,
                            title: this._getText("msgNoActivitiesAssignmentTitle"),
                            description: this._getText("msgNoActivitiesAssignmentDesc", [totalVisibleCount, userOrgLevelName || userOrgLevelId]),
                            type: "information"
                        });
                    } else if (filteredOutCount > 0) {
                        MessageToast.show(this._getText("msgActivitiesHidden", [filteredOutCount]));
                        viewModel.setProperty("/noActivitiesMessage", { show: false });
                    } else {
                        viewModel.setProperty("/noActivitiesMessage", { show: false });
                    }
                }

                // Preload activity responsible persons for display
                const responsibleExternalIds = filteredActivities
                    .map(a => a.responsibles?.[0]?.externalId)
                    .filter(id => id && id !== 'N/A');
                
                if (responsibleExternalIds.length > 0) {
                    const uniqueResponsibleIds = [...new Set(responsibleExternalIds)];
                    await PersonService.preloadPersonsByExternalId(uniqueResponsibleIds);
                }

                const productGroups = ProductGroupService.groupActivitiesByProduct(
                    filteredActivities,
                    serviceOrderData.externalId
                );

                // Get entry activity ID for highlighting (only if opened from Activity)
                const entryContext = viewModel.getProperty("/entryContext");
                const entryActivityId = entryContext?.objectType === 'ACTIVITY' ? entryContext.objectId : null;

                // Prepare data WITHOUT auto-loading T&M
                const optimizedGroups = productGroups.map(group => ({
                    ...group,
                    expanded: true,
                    activityCount: group.activities.length,
                    activities: group.activities.map(activity => this._prepareActivityDataOptimized(activity, entryActivityId))
                }));

                // Enrich service order data (parallel preloading)
                if (serviceOrderData) {
                    const preloadPromises = [];
                    
                    if (serviceOrderData.responsibleExternalId && serviceOrderData.responsibleExternalId !== 'N/A') {
                        preloadPromises.push(
                            PersonService.preloadPersonsByExternalId([serviceOrderData.responsibleExternalId])
                        );
                    }
                    
                    if (serviceOrderData.businessPartnerExternalId && serviceOrderData.businessPartnerExternalId !== 'N/A') {
                        preloadPromises.push(
                            BusinessPartnerService.preloadBusinessPartnersByExternalId([serviceOrderData.businessPartnerExternalId])
                        );
                    }
                    
                    // Wait for all preloads to complete
                    if (preloadPromises.length > 0) {
                        await Promise.all(preloadPromises);
                    }
                    
                    // Now set display texts from cache
                    serviceOrderData.responsibleDisplayText = serviceOrderData.responsibleExternalId && serviceOrderData.responsibleExternalId !== 'N/A'
                        ? PersonService.getPersonDisplayTextByExternalId(serviceOrderData.responsibleExternalId)
                        : serviceOrderData.responsibleExternalId;
                    
                    serviceOrderData.businessPartnerDisplayText = serviceOrderData.businessPartnerExternalId && serviceOrderData.businessPartnerExternalId !== 'N/A'
                        ? BusinessPartnerService.getBusinessPartnerDisplayTextByExternalId(serviceOrderData.businessPartnerExternalId)
                        : serviceOrderData.businessPartnerExternalId;
                    
                    viewModel.setProperty("/serviceCall", serviceOrderData);
                }

                viewModel.setProperty("/productGroups", optimizedGroups);

                // Batch load T&M reports and supporting technicians in background
                this._batchLoadTMReports(optimizedGroups);
                this._batchLoadSupportingTechnicians(optimizedGroups);

            } catch (error) {
                console.error("Load activities error:", error);
            } finally {
                viewModel.setProperty("/activitiesLoading", false);
            }
        },

        /**
         * Reset activity data
         * @private
         */
        _resetActivityData() {
            const model = this.getView().getModel("view");
            model.setProperty("/productGroups", []);
        },

        /**
         * Clear all service caches.
         * Called during refresh to ensure fresh data is loaded.
         * @private
         */
        _clearAllServiceCaches() {
            ApprovalService.clearCache();
            PersonService.clearCache();
            BusinessPartnerService.clearCache();
            TimeTaskService.clearCache();
            ItemService.clearCache();
            ExpenseTypeService.clearCache();
            UdfMetaService.clearCache();
            TechnicianService.clearCache();
            OrganizationService.clearCache();
        },

        /* =========================================================================
         * T&M BATCH LOADING METHODS
         * ========================================================================= */

        /**
         * Batch load T&M reports for all activities
         * @private
         */
        async _batchLoadTMReports(productGroups) {
            const allActivities = [];

            productGroups.forEach((group, groupIndex) => {
                group.activities.forEach((activity, activityIndex) => {
                    allActivities.push({
                        id: activity.id,
                        code: activity.code,
                        path: `/productGroups/${groupIndex}/activities/${activityIndex}`
                    });
                });
            });

            const model = this.getView().getModel("view");
            await this._batchLoadWithEnrichment(allActivities, model);
            this._updateTMCounts(model);
            model.refresh(true);
        },

        /**
         * Batch load with enrichment in chunks
         * @private
         */
        async _batchLoadWithEnrichment(activities, model) {
            const chunkSize = 10;

            for (let i = 0; i < activities.length; i += chunkSize) {
                const chunk = activities.slice(i, i + chunkSize);

                chunk.forEach(activity => {
                    TMDataService.setLoadingState(model, activity.path, true);
                });

                const promises = chunk.map(activity =>
                    this._loadAndEnrichSingleActivity(activity.id, activity.path, model)
                );

                try {
                    await Promise.allSettled(promises);
                } catch (error) {
                    console.error('Error in batch loading chunk:', error);
                }

                if (i + chunkSize < activities.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        },

        /**
         * Load and enrich T&M for single activity
         * @private
         */
        async _loadAndEnrichSingleActivity(activityId, activityPath, model) {
            try {
                const tmData = await TMDataService.loadTMReports(activityId);
                await this._enrichTMReports(tmData.reports);
                TMDataService.updateActivityWithTMData(model, activityPath, tmData);

            } catch (error) {
                console.error(`Error loading T&M for activity ${activityId}:`, error);
                TMDataService.setErrorState(model, activityPath);
            }
        },

        /* =========================================================================
         * SUPPORTING TECHNICIANS BATCH LOADING
         * ========================================================================= */

        /**
         * Batch load supporting technicians for all activities.
         * Fetches each activity individually via Data API (composite-tree doesn't include supportingPersons).
         * @param {Array} productGroups - Product groups with activities
         * @private
         */
        async _batchLoadSupportingTechnicians(productGroups) {
            const model = this.getView().getModel("view");
            const allActivities = [];

            productGroups.forEach((group, groupIndex) => {
                group.activities.forEach((activity, activityIndex) => {
                    allActivities.push({
                        id: activity.id,
                        path: `/productGroups/${groupIndex}/activities/${activityIndex}`
                    });
                });
            });

            // Process in chunks to avoid API overload
            const chunkSize = 5;
            for (let i = 0; i < allActivities.length; i += chunkSize) {
                const chunk = allActivities.slice(i, i + chunkSize);

                const promises = chunk.map(activity =>
                    this._loadSupportingTechniciansForActivity(activity.id, activity.path, model)
                );

                try {
                    await Promise.allSettled(promises);
                } catch (error) {
                    console.error('Error in batch loading supporting technicians:', error);
                }

                if (i + chunkSize < allActivities.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            model.refresh(true);
        },

        /**
         * Load supporting technicians for a single activity.
         * @param {string} activityId - Activity ID
         * @param {string} activityPath - Model path to the activity
         * @param {Object} model - View model
         * @private
         */
        async _loadSupportingTechniciansForActivity(activityId, activityPath, model) {
            try {
                const technicianData = await ActivityService.fetchActivityTechnicians(activityId);
                const supportingIds = technicianData.supportingPersonIds || [];

                if (supportingIds.length === 0) {
                    model.setProperty(activityPath + "/techniciansDisplayText", "N/A");
                    return;
                }

                // Preload persons if not cached
                await PersonService.preloadPersonsById(supportingIds);

                // Resolve IDs to display names
                const names = supportingIds
                    .map(id => PersonService.getPersonDisplayTextById(id))
                    .filter(name => name && name !== 'N/A');

                model.setProperty(
                    activityPath + "/techniciansDisplayText",
                    names.length > 0 ? names.join(', ') : 'N/A'
                );
            } catch (error) {
                console.error(`Error loading technicians for activity ${activityId}:`, error);
                model.setProperty(activityPath + "/techniciansDisplayText", "N/A");
            }
        }
    };
});