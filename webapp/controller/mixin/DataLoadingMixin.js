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
 * Visibility policy:
 * - ORGANIZATION LEVEL first - always, on every platform.
 * - Then two gates, in order (see _loadServiceCallActivities):
 *     GATE A  membership of the SERVICE CALL's team (TeamTimeFrame) -> sees all
 *     GATE B  otherwise, per-activity responsible / supporting technician
 *   Neither -> no activities, with an explanatory empty state.
 * - Applies to BOTH the Mobile Web Container and the FSM Web UI. FSM Policy
 *   Groups cannot do this for us: the backend calls FSM with OAuth2 client
 *   credentials, a technical client carrying no user identity, so no user
 *   policy is ever evaluated.
 * - Only genuine faults are logged (a failed lookup, an unresolved identity).
 *   The step-by-step "[Visibility]" tracing used while building this is gone.
 *
 * @file DataLoadingMixin.js
 * @module com/tns/fsm/timematerialext/app/controller/mixin/DataLoadingMixin
 */
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "com/tns/fsm/timematerialext/app/utils/services/OrganizationService",
    "com/tns/fsm/timematerialext/app/utils/services/TimeTaskService",
    "com/tns/fsm/timematerialext/app/utils/services/ItemService",
    "com/tns/fsm/timematerialext/app/utils/services/ExpenseTypeService",
    "com/tns/fsm/timematerialext/app/utils/services/ActivityService",
    "com/tns/fsm/timematerialext/app/utils/services/ServiceOrderService",
    "com/tns/fsm/timematerialext/app/utils/services/PersonService",
    "com/tns/fsm/timematerialext/app/utils/services/BusinessPartnerService",
    "com/tns/fsm/timematerialext/app/utils/services/ApprovalService",
    "com/tns/fsm/timematerialext/app/utils/services/UdfMetaService",
    "com/tns/fsm/timematerialext/app/utils/services/TechnicianService",
    "com/tns/fsm/timematerialext/app/utils/services/UserSettingsService",
    "com/tns/fsm/timematerialext/app/utils/services/ContextService",
    "com/tns/fsm/timematerialext/app/utils/services/TimeZoneService",
    "com/tns/fsm/timematerialext/app/utils/helpers/URLHelper",
    "com/tns/fsm/timematerialext/app/utils/helpers/ProductGroupService",
    "com/tns/fsm/timematerialext/app/utils/tm/TMDataService"
], (MessageToast, MessageBox, OrganizationService, TimeTaskService, ItemService, ExpenseTypeService, ActivityService, ServiceOrderService, PersonService, BusinessPartnerService, ApprovalService, UdfMetaService, TechnicianService, UserSettingsService, ContextService, TimeZoneService, URLHelper, ProductGroupService, TMDataService) => {
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
                        // Person identity. Not used for activity filtering any more;
                        // personExternalIds feeds PERSON fields in User Settings
                        // (the value a PATCH writes) and personDisplayName is what
                        // the table shows.
                        viewModel.setProperty("/webContainerContext/personIds", resolvedOrgLevel.personIds || []);
                        viewModel.setProperty("/webContainerContext/personExternalIds", resolvedOrgLevel.personExternalIds || []);
                        // refIds too: the visibility gates match against every value
                        // the user can be referenced by - see _getUserIdentityKeys.
                        viewModel.setProperty("/webContainerContext/personRefIds", resolvedOrgLevel.personRefIds || []);
                        viewModel.setProperty("/webContainerContext/persons", resolvedOrgLevel.persons || []);
                        viewModel.setProperty("/webContainerContext/personDisplayName", resolvedOrgLevel.personDisplayName || "");

                        // Warm the user settings now that the person is known, so the
                        // first "Add Entry" does not wait for them. Fire-and-forget:
                        // the dialog awaits them anyway, and a failure here only means
                        // entries fall back to the activity's planned start date.
                        // The WHOLE identity list, not [0]: the user's settings
                        // record may be stored under the externalId of any of
                        // their Person rows (ERPUSER / EMPLOYEE), and sending
                        // only one risks missing it and creating a duplicate.
                        // The list is ranked backend-side, so [0] stays stable.
                        UserSettingsService.ensureLoaded(
                            resolvedOrgLevel.personExternalIds || []
                        );
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
                        // Person identity is independent of the org level match, so
                        // store it here too - User Settings still needs it.
                        if (resolvedOrgLevel) {
                            viewModel.setProperty("/webContainerContext/personIds", resolvedOrgLevel.personIds || []);
                            viewModel.setProperty("/webContainerContext/personExternalIds", resolvedOrgLevel.personExternalIds || []);
                            viewModel.setProperty("/webContainerContext/personRefIds", resolvedOrgLevel.personRefIds || []);
                            viewModel.setProperty("/webContainerContext/persons", resolvedOrgLevel.persons || []);
                            viewModel.setProperty("/webContainerContext/personDisplayName", resolvedOrgLevel.personDisplayName || "");
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
                        cloudHost: context.cloudHost,
                        ...this._timeZoneModelFields()
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
                        source: 'url',
                        ...this._timeZoneModelFields()
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
         * Time-zone fields for the /webContainerContext model object.
         *
         * Purpose:
         *   Supply the Context Info dialog with the active company zone and,
         *   when relevant, the device zone.
         *
         * Business Context:
         *   These fields are display-only. Nothing computes against them - the
         *   authoritative value lives in TimeZoneService. The device zone is
         *   shown purely so a wrong-day report can be diagnosed at a glance; it
         *   is never used as a source, because a technician's phone travelling
         *   abroad must not move a workday onto a different calendar date.
         *
         * Inputs:  none
         * Outputs: { timeZone, timeZoneSource, deviceTimeZone, timeZoneMismatch }
         * Dependencies: TimeZoneService
         *
         * Implementation Details:
         *   Spread into EVERY object assigned to /webContainerContext. That
         *   property is replaced wholesale (on initial load and again on
         *   Refresh), so fields set separately afterwards would be silently
         *   wiped on the next refresh.
         *
         * @returns {Object} time-zone display fields
         * @private
         */
        _timeZoneModelFields() {
            const deviceZone = TimeZoneService.getDeviceZone();
            return {
                timeZone: TimeZoneService.get(),
                timeZoneSource: TimeZoneService.getSource(),
                deviceTimeZone: deviceZone || "N/A",
                timeZoneMismatch: TimeZoneService.hasDeviceMismatch()
            };
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
         * Load all activities for a service call.
         *
         * FILTERING - ORG LEVEL, THEN VISIBILITY. BOTH PLATFORMS.
         *
         *   1. Organization level - always.
         *   2. Visibility, resolved in two gates:
         *        GATE A  Team on the SERVICE CALL. If the logged-in user is a
         *                member of that team, they see every activity of the
         *                service order - nothing further is filtered.
         *        GATE B  Otherwise, per-activity assignment: responsible or
         *                supporting technician, exactly as before.
         *      Neither matches -> no activities, and the empty state says why.
         *
         *   Gate A is a whole-service-order decision, so it runs once. Gate B is
         *   per activity and only runs when Gate A did not open.
         *
         * BOTH MOBILE AND WEB
         *   This used to be mobile-only, on the reasoning that the web path is
         *   used by dispatchers. With the team acting as the dispatcher's key,
         *   that carve-out is gone: a dispatcher belongs to the team and passes
         *   Gate A on either platform, so visibility no longer depends on the
         *   device. That is the better model - the previous one made the same
         *   user see different data on a phone than on a laptop.
         *
         * STILL NOT A SECURITY BOUNDARY
         *   The filtering happens in the browser. Every FSM call the backend makes
         *   uses OAuth2 client credentials - a technical client with no user
         *   identity - so FSM Policy Groups never apply, and the /api/v1/* routes
         *   still serve any authenticated session the full data. If this ever has
         *   to become an actual restriction, both gates move into the Node layer.
         *
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

                // FILTER: Organization level (mandatory, and the only filter)
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
                            const match = formattedActivityOrgLevelId === userOrgLevelId;
                            return match;
                        });
                    });

                    // FILTER 2: Visibility - GATE A (service call team), then
                    // GATE B (per-activity assignment). Both platforms.
                    const teamAccess = await this._resolveTeamAccess(serviceOrderData);

                    if (!teamAccess.isMember) {
                        filteredActivities = await this._filterActivitiesByAssignment(filteredActivities);
                    }

                    // Show info messages about filtering
                    const filteredOutCount = totalVisibleCount - filteredActivities.length;
                    if (filteredOutCount > 0 && filteredActivities.length === 0) {
                        viewModel.setProperty("/noActivitiesMessage", {
                            show: true,
                            title: this._getText("msgNoActivitiesAccessTitle"),
                            description: this._getText("msgNoActivitiesAccessDesc", [totalVisibleCount]),
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
            UserSettingsService.clearCache();
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
         *
         * NOTE: This is DISPLAY ONLY (the "Technicians" field on the activity panel
         * and the technician pool in the T&M creation dialog). It does not affect
         * which activities are visible.
         *
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
         * Every value the logged-in user can be recognised by: Person ids,
         * externalIds and refIds.
         *
         * One human has several Person rows (ERPUSER + EMPLOYEE), each with its
         * own id and its own externalId, and different parts of FSM reference
         * different ones - a TeamTimeFrame names a Person id, an activity's
         * responsible may carry either. Matching against the whole set is what
         * makes both gates work regardless of which row FSM happens to name.
         *
         * @returns {Set<string>} identity keys, empty when the user is unresolved
         * @private
         */
        _getUserIdentityKeys() {
            const viewModel = this.getView().getModel("view");
            const ctx = "/webContainerContext/";

            return new Set([
                ...(viewModel.getProperty(ctx + "personIds") || []),
                ...(viewModel.getProperty(ctx + "personExternalIds") || []),
                ...(viewModel.getProperty(ctx + "personRefIds") || [])
            ].filter(Boolean).map(key => String(key)));
        },

        /**
         * GATE A - is the logged-in user a member of the service call's team?
         *
         * A member sees every activity of the service order. A non-member falls
         * through to the per-activity assignment check.
         *
         * The team is resolved SERVER-SIDE from the service call id: the
         * composite-tree payload the app loads does not include the service
         * call's `team` field, so the backend joins ServiceCall -> TeamTimeFrame
         * in one query instead. The id is used rather than the code because it is
         * the value the app already holds in every context.
         *
         * Fails CLOSED in every uncertain case: no service call id, no team, an
         * empty team, a failed lookup, or an unresolved user identity all return
         * isMember false. The gate can therefore only ever grant access on a
         * positive, explicit match.
         *
         * @param {Object} serviceOrderData - extracted service call header
         * @returns {Promise<{isMember: boolean, teamPersonIds: string[]}>}
         * @private
         */
        async _resolveTeamAccess(serviceOrderData) {
            const serviceCallId = serviceOrderData?.id || null;

            if (!serviceCallId) {
                return { isMember: false, teamPersonIds: [] };
            }

            const teamPersonIds = await ServiceOrderService.fetchTeamPersons(serviceCallId);
            const userKeys = this._getUserIdentityKeys();

            if (teamPersonIds.length === 0) {
                // No team on the service call, or it has no members.
                return { isMember: false, teamPersonIds };
            }

            if (userKeys.size === 0) {
                console.warn("DataLoadingMixin: user identity unresolved - treating as NOT a team member");
                return { isMember: false, teamPersonIds };
            }

            const isMember = teamPersonIds.some(personId => userKeys.has(String(personId)));

            return { isMember, teamPersonIds };
        },

        /**
         * GATE B - keep only the activities the logged-in user is assigned to, as
         * responsible OR as a supporting technician. Runs on both platforms, and
         * only when the team gate did not already open.
         *
         * IDENTITY - WHY THIS IS SAFER THAN THE FILTER WE DELETED
         *   One human has several Person rows (ERPUSER + EMPLOYEE), each with its
         *   own id and externalId. An activity may reference EITHER. The earlier
         *   version of this filter compared against a single identity, so a user
         *   whose activities referenced the other row would have seen NOTHING -
         *   with no error, just an empty list. This version matches against every
         *   id and externalId the user resolves to.
         *
         * ROUND TRIPS - WHY THIS IS NOT THE OLD N+1
         *   The old filter called fetchActivityTechnicians() for EVERY activity
         *   purely to decide visibility. Here the composite-tree payload is used
         *   first; only activities whose supportingPersons the tree did not carry
         *   are fetched, in bounded parallel. When the tree carries the field -
         *   check this with one composite-tree response, and this fallback can be
         *   deleted - the filter costs zero extra requests.
         *
         * FAIL CLOSED
         *   If the user's identity could not be resolved, nothing is shown. For a
         *   visibility restriction, showing everything on an unresolved identity
         *   is the wrong way to fail.
         *
         * @param {Array<Object>} activities - activities that passed the org-level filter
         * @returns {Promise<Array<Object>>} only the activities assigned to the user
         * @private
         */
        async _filterActivitiesByAssignment(activities) {
            if (!activities || activities.length === 0) return [];

            // Every identity of this user - see the identity note above.
            const userKeys = this._getUserIdentityKeys();

            if (userKeys.size === 0) {
                console.warn("DataLoadingMixin: no person identity resolved - "
                    + "hiding all activities rather than showing unfiltered data");
                return [];
            }

            // Which activities need the extra lookup.
            //
            // The composite-tree payload carries `responsibles` but NOT
            // `supportingPersons`, so an activity is only judged from the tree
            // when BOTH lists are present. Anything else is fetched.
            const needsLookup = activities.filter(activity => !this._hasAssignmentData(activity));
            const fetchedById = new Map();

            if (needsLookup.length > 0) {
                const CHUNK = 5;
                for (let i = 0; i < needsLookup.length; i += CHUNK) {
                    const chunk = needsLookup.slice(i, i + CHUNK);
                    const results = await Promise.allSettled(
                        chunk.map(activity => ActivityService.fetchActivityTechnicians(activity.id))
                    );
                    results.forEach((result, index) => {
                        if (result.status === "fulfilled") {
                            fetchedById.set(chunk[index].id, result.value);
                        } else {
                            // A failed lookup must not silently reveal the activity.
                            console.error("DataLoadingMixin: assignment lookup failed for activity "
                                + chunk[index].id, result.reason);
                        }
                    });
                }
            }

            const visible = activities.filter(activity => {
                const fetched = fetchedById.get(activity.id);

                // Per list, prefer what the tree carried and fall back to the
                // fetch. Taking them INDEPENDENTLY is the point: the tree has
                // responsibles and the fetch has supportingPersons, and an
                // all-or-nothing choice loses one of them.
                const responsibles = Array.isArray(activity.responsibles)
                    ? activity.responsibles
                    : (fetched ? fetched.responsibleIds : null);
                const supporting = Array.isArray(activity.supportingPersons)
                    ? activity.supportingPersons
                    : (fetched ? fetched.supportingPersonIds : null);

                const label = activity.code || activity.id;

                // Nothing known at all (the lookup failed) -> not visible. Fail closed.
                if (!Array.isArray(responsibles) && !Array.isArray(supporting)) {
                    console.warn(`DataLoadingMixin: no assignment data for activity ${label} - hiding it`);
                    return false;
                }
                if (!Array.isArray(supporting)) {
                    console.warn(`DataLoadingMixin: supporting technicians unknown for activity ${label} - `
                        + `judging on responsibles only`);
                }

                return this._matchesAnyPerson(responsibles, userKeys)
                    || this._matchesAnyPerson(supporting, userKeys);
            });

            return visible;
        },


        /**
         * True when the activity already carries BOTH assignment lists, so no
         * extra request is needed to judge it.
         *
         * MUST BE "AND", NOT "OR".
         *   The composite-tree payload carries `responsibles` but not
         *   `supportingPersons`. With an OR the activity looked fully described,
         *   no lookup ran, and supporting technicians were never checked - a user
         *   who was ONLY a supporting technician saw nothing, with no error.
         *
         *   As things stand this returns false for every activity coming from the
         *   composite tree, so the lookup always runs. It is kept as a check
         *   rather than removed so that the day FSM adds supportingPersons to the
         *   tree, the extra round trips disappear on their own.
         *
         * @param {Object} activity
         * @returns {boolean}
         * @private
         */
        _hasAssignmentData(activity) {
            return Array.isArray(activity?.responsibles) && Array.isArray(activity?.supportingPersons);
        },

        /**
         * Does any entry of a person reference list name one of the user's identities?
         *
         * FSM is inconsistent about the shape of these lists - sometimes plain id
         * strings, sometimes objects carrying id / externalId / person - so every
         * shape is checked rather than assuming one.
         *
         * @param {Array} personRefs - responsibles / supportingPersons, any shape
         * @param {Set<string>} userKeys - every id and externalId of the user
         * @returns {boolean}
         * @private
         */
        _matchesAnyPerson(personRefs, userKeys) {
            if (!Array.isArray(personRefs)) return false;

            return personRefs.some(ref => {
                if (!ref) return false;
                if (typeof ref === "string") return userKeys.has(ref);
                return [ref.id, ref.externalId, ref.person, ref.personId, ref.code]
                    .filter(Boolean)
                    .some(value => userKeys.has(String(value)));
            });
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