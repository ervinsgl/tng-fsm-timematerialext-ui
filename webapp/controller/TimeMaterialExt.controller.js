/**
 * View1.controller.js
 * 
 * Main controller for the Service Confirmation application.
 * Handles FSM Mobile web container integration, user organization level
 * resolution, activity loading, and T&M (Time & Materials) reporting.
 * 
 * @file View1.controller.js
 * @module com/tng/fsm/timematerialext/app/controller/View1
 * 
 * Initialization Flow:
 * 1. Load web container context (FSM Mobile sends userName, cloudId, etc.)
 * 2. Resolve user's organization level from FSM APIs
 * 3. Load organizational hierarchy for name lookups
 * 4. Load lookup data (tasks, items, expense types) in background
 * 5. Load activity from URL/context and filter by user's org level
 * 
 * Mixins:
 * - DataLoadingMixin: All data fetching and loading operations
 * - TMDialogMixin: Core T&M dialog handlers (enrichment, edit mode)
 * - TMEditMixin: Individual entry edit/save handlers
 * - TMTableMixin: Table filter/sort/edit selected handlers
 * - TMExpenseMileageMixin: Expense & Mileage creation handlers
 * - TMMaterialMixin: Material creation handlers
 * - TMTimeEntryMixin: Time entry creation with repeat
 * - TMSaveMixin: Save all T&M entries
 * - TechnicianMixin: Technician/task selection handlers
 */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "com/tng/fsm/timematerialext/app/model/formatter",
    "com/tng/fsm/timematerialext/app/utils/services/OrganizationService",
    "com/tng/fsm/timematerialext/app/utils/services/PersonService",
    "com/tng/fsm/timematerialext/app/utils/services/ItemService",
    "com/tng/fsm/timematerialext/app/utils/services/UdfMetaService",
    "com/tng/fsm/timematerialext/app/utils/services/TypeConfigService",
    "com/tng/fsm/timematerialext/app/utils/services/CacheService",
    "com/tng/fsm/timematerialext/app/utils/tm/TMDialogService",
    "./mixin/DataLoadingMixin",
    "./mixin/TMDialogMixin",
    "./mixin/TMEditMixin",
    "./mixin/TMTableMixin",
    "./mixin/TMExpenseMileageMixin",
    "./mixin/TMMaterialMixin",
    "./mixin/TMTimeEntryMixin",
    "./mixin/TMSaveMixin",
    "./mixin/TechnicianMixin"
], (Controller, JSONModel, Fragment, MessageToast, MessageBox, formatter, OrganizationService, PersonService, ItemService, UdfMetaService, TypeConfigService, CacheService, TMDialogService, DataLoadingMixin, TMDialogMixin, TMEditMixin, TMTableMixin, TMExpenseMileageMixin, TMMaterialMixin, TMTimeEntryMixin, TMSaveMixin, TechnicianMixin) => {
    "use strict";

    /**
     * Merge all mixins with controller methods
     */
    return Controller.extend("com.tng.fsm.timematerialext.app.controller.TimeMaterialExt", Object.assign({},
        DataLoadingMixin,
        TMDialogMixin,
        TMEditMixin,
        TMTableMixin,
        TMExpenseMileageMixin,
        TMMaterialMixin,
        TMTimeEntryMixin,
        TMSaveMixin,
        TechnicianMixin,
        {

            formatter: formatter,

            /**
             * Get i18n text with optional parameters
             * @param {string} key - i18n key
             * @param {Array} [args] - Optional arguments for placeholders
             * @returns {string} Translated text
             * @private
             */
            _getText(key, args) {
                const oBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
                return oBundle.getText(key, args);
            },

            /* =========================================================================
             * LIFECYCLE METHODS
             * ========================================================================= */

            /**
             * Controller initialization
             *
             * NOTE on signature: this method is intentionally NOT declared `async`.
             * UI5 lifecycle listeners must return undefined; an async method returns
             * a Promise and triggers a [FUTURE FATAL] warning ("Event Listener 'onInit'
             * must not have a return value"). More importantly, UI5 does NOT await
             * async lifecycle methods — it renders the view as soon as onInit returns.
             * If onInit is async, the view (including the Refresh button) becomes
             * interactive BEFORE _initializeModel() runs, allowing users to click
             * handlers that crash because the view model doesn't exist yet.
             *
             * The synchronous parts (TMDialogService init, model creation) MUST
             * complete before onInit returns. The async parts (TypeConfigService init,
             * activity loading) are delegated to _initializeAsync, called fire-and-forget.
             */
            onInit() {
                TMDialogService.init(this);
                this._initializeModel();
                this._initializeAsync();
            },

            /**
             * Asynchronous initialization sequence.
             *
             * Awaits TypeConfigService.init() BEFORE starting the activity loading
             * chain. Activity preparation (_prepareActivityDataOptimized) reads
             * TypeConfigService.isExpenseType() / isMileageType() synchronously and
             * bakes the result into the model — if init() hadn't resolved yet,
             * activities with custom Service Product IDs would be misclassified,
             * and the flag persists for the page lifetime (no re-derivation).
             * Awaiting here eliminates that race entirely.
             *
             * Cost: adds one synchronous network round-trip (~50-200ms) to first
             * load, blocking subsequent activity load. Acceptable trade-off given
             * the alternative is a silent, time-bombed bug that fires only after
             * Type Config customization.
             *
             * @private
             */
            async _initializeAsync() {
                // Establish auth context FIRST. Everything downstream needs the Bearer
                // token (Web UI) or session cookie (Mobile) that this sets up.
                // In Mobile flow, the cookie is already set by the WebContainer POST
                // handler before the page even loads, so this is essentially a no-op
                // pass-through. In Web UI flow, this awaits the Shell SDK roundtrip
                // and the shell-session-init backend call.
                try {
                    await this._loadWebContainerContext();
                } catch (err) {
                    console.error("TimeMaterialExt: _loadWebContainerContext failed; continuing", err);
                }

                // Now that auth is established, initialize TypeConfigService.
                // It calls /api/v1/get-type-config which requires the session.
                // Wrapped in try/catch: TypeConfigService falls back to built-in
                // defaults internally on fetch failure, so we proceed even if this rejects.
                try {
                    await TypeConfigService.init();
                } catch (err) {
                    console.error("TimeMaterialExt: TypeConfigService.init() failed; continuing with defaults", err);
                }

                // Now fire the data-loading work. These can run in parallel with each other
                // since they're independent — only the dependencies on auth and type config
                // needed to be serialized above.
                this._loadOrganizationLevels();
                this._loadOrganizationalHierarchy();
                CacheService.warmAllCaches();
            },

            /* =========================================================================
             * MODEL INITIALIZATION
             * ========================================================================= */

            /**
             * Initialize the view model with default state
             * @private
             */
            _initializeModel() {
                const viewModel = new JSONModel({
                    busy: false,
                    pageLoading: true,
                    activitiesLoading: false,
                    organizationLevelsLoading: false,

                    // Entry context - tracks how app was opened
                    entryContext: {
                        objectType: null,      // 'ACTIVITY' or 'SERVICECALL'
                        objectId: null,        // The ID of the entry object
                        source: null           // 'URL' or 'WebContainer' or 'shell'
                    },

                    webContainerContext: {
                        available: false,
                        userName: null,
                        language: null,
                        cloudAccount: null,
                        companyName: null,
                        objectType: null,
                        cloudId: null,
                        orgLevelId: null,
                        orgLevelName: "Loading...",
                        source: null,
                        cloudHost: null
                    },

                    serviceCall: {
                        id: null,
                        externalId: null,
                        subject: null,
                        businessPartnerExternalId: null,
                        responsibleExternalId: null,
                        earliestStartDateTime: null,
                        dueDateTime: null
                    },

                    organizationLevels: [],
                    selectedOrganizationLevel: {
                        key: null,
                        text: "Please select organization level"
                    },

                    productGroups: [],
                    organizationSelected: false,
                    userOrgLevelResolved: false,

                    // Message for when activities are filtered out
                    noActivitiesMessage: {
                        show: false,
                        title: "",
                        description: "",
                        type: "information"
                    }
                });

                this.getView().setModel(viewModel, "view");
            },

            /* =========================================================================
             * ACTIVITY DATA PREPARATION
             * ========================================================================= */

            /**
             * Prepare activity data for display.
             * @param {Object} activity - Activity data
             * @param {string} [entryActivityId] - ID of entry activity (for highlighting)
             * @returns {Object} Prepared activity data
             * @private
             */
            _prepareActivityDataOptimized(activity, entryActivityId) {
                const isClosed = activity.executionStage === 'CLOSED';
                const isCancelled = activity.executionStage === 'CANCELLED';
                const isReadOnly = isClosed || isCancelled;
                const fullActivity = activity.fullActivity || {};

                // Check if this is the entry activity (case-insensitive comparison)
                const entryIdLower = entryActivityId ? entryActivityId.toLowerCase() : null;
                const isEntryActivity = entryIdLower && (
                    (activity.id && activity.id.toLowerCase() === entryIdLower) ||
                    (fullActivity.id && fullActivity.id.toLowerCase() === entryIdLower)
                );

                // Use string for customData (booleans don't work with writeToDom)
                const entryActivityFlag = isEntryActivity ? "true" : "false";

                const quantity = this._getUdfValue(fullActivity, 'Z_Quantity') || 'N/A';
                const quantityUoM = this._getUdfValue(fullActivity, 'Z_QuantityUoM') || 'N/A';
                const itemTypeCode = this._getUdfValue(fullActivity, 'Z_ActivityItemTypeCode') || 'N/A';
                const formattedQuantity = quantity !== 'N/A' && quantityUoM !== 'N/A'
                    ? `${quantity} ${quantityUoM}`
                    : quantity;

                // Determine service product type using TypeConfigService
                const serviceProductId = fullActivity.serviceProduct?.externalId || 'N/A';
                const isExpenseType = TypeConfigService.isExpenseType(serviceProductId);
                const isMileageType = TypeConfigService.isMileageType(serviceProductId);
                const isTimeMaterialType = TypeConfigService.isTimeMaterialType(serviceProductId);

                return {
                    id: activity.id,
                    code: activity.code,
                    subject: activity.subject,
                    status: activity.status,
                    type: activity.type,
                    executionStage: activity.executionStage,
                    plannedStartDate: activity.plannedStartDate,
                    plannedEndDate: activity.plannedEndDate,

                    isClosed: isClosed,
                    isCancelled: isCancelled,
                    isReadOnly: isReadOnly,
                    isEntryActivity: isEntryActivity,
                    entryActivityFlag: entryActivityFlag,

                    // Service Product type flags
                    isExpenseType: isExpenseType,
                    isMileageType: isMileageType,
                    isTimeMaterialType: isTimeMaterialType,

                    tmReportsLoaded: false,
                    tmReportsLoading: false,
                    tmReportsCount: 0,
                    tmTimeEffortCount: 0,
                    tmMaterialCount: 0,
                    tmExpenseCount: 0,
                    tmMileageCount: 0,
                    tmMaterialQtyReported: 0,
                    tmAzHoursReported: 0,
                    tmFzHoursReported: 0,
                    tmWzHoursReported: 0,
                    tmEditMode: false,
                    expenseEditMode: false,
                    mileageEditMode: false,

                    // Auto-expand entry activity, collapse others
                    detailsExpanded: isEntryActivity,
                    textClass: isReadOnly ? 'closedActivityText' : '',
                    statusState: this._getStatusState(activity),
                    stageState: this._getStageState(activity),

                    externalId: fullActivity.externalId || 'N/A',
                    orgLevelId: fullActivity.orgLevelIds?.[0] || 'N/A',
                    orgLevelDisplayText: fullActivity.orgLevelIds?.[0]
                        ? OrganizationService.getOrgLevelDisplayTextById(fullActivity.orgLevelIds[0])
                        : 'N/A',
                    responsibleId: fullActivity.responsibles?.[0]?.externalId || 'N/A',
                    responsibleDisplayText: fullActivity.responsibles?.[0]?.externalId
                        ? PersonService.getPersonDisplayTextByExternalId(fullActivity.responsibles[0].externalId)
                        : 'N/A',
                    techniciansDisplayText: '...',
                    serviceProductId: serviceProductId,
                    serviceProductDisplayText: serviceProductId !== 'N/A'
                        ? ItemService.getItemDisplayTextByExternalId(serviceProductId)
                        : 'N/A',
                    plannedDuration: fullActivity.plannedDurationInMinutes || 0,

                    quantity: quantity,
                    quantityUoM: quantityUoM,
                    formattedQuantity: formattedQuantity,
                    itemTypeCode: itemTypeCode,

                    addressStreet: fullActivity.address?.street || '',
                    addressStreetNumber: fullActivity.address?.streetNumber || '',
                    addressCity: fullActivity.address?.city || '',
                    addressFull: this._formatAddress(fullActivity.address),

                    formattedStartDate: this.formatter.formatDateTime(activity.plannedStartDate),
                    formattedEndDate: this.formatter.formatDateTime(activity.plannedEndDate),
                    formattedDuration: (fullActivity.plannedDurationInMinutes || 0) + ' min',

                    fullActivity: fullActivity
                };
            },

            /* =========================================================================
             * HELPER METHODS
             * ========================================================================= */

            /**
             * Extract UDF value from activity
             * @private
             */
            _getUdfValue(activity, udfExternalId) {
                if (!activity.udfValues || !Array.isArray(activity.udfValues)) {
                    return null;
                }

                const udfValue = activity.udfValues.find(udf =>
                    udf.udfMeta && udf.udfMeta.externalId === udfExternalId
                );

                return udfValue ? udfValue.value : null;
            },

            /**
             * Extract UDF value by externalId from T&M report
             * @private
             */
            _getUdfValueByExternalId(udfValues, targetExternalId) {
                if (!udfValues || !Array.isArray(udfValues) || !targetExternalId) {
                    return null;
                }

                for (const udf of udfValues) {
                    if (udf.meta) {
                        const externalId = UdfMetaService.getExternalIdById(udf.meta);
                        if (externalId === targetExternalId) {
                            return udf.value;
                        }
                    }
                }

                return null;
            },

            /**
             * Build entry header text for T&M report
             * Simplified format: "Type - Name" (e.g., "Time Effort - Arbeitszeit")
             * @private
             */
            _buildEntryHeaderText(report) {
                const type = report.type;
                let name = '';

                switch (type) {
                    case 'Time Effort':
                        name = this._extractNameFromDisplayText(report.taskDisplayText);
                        break;
                    case 'Material':
                        name = this._extractNameFromDisplayText(report.itemDisplayText);
                        break;
                    case 'Expense':
                        name = this._extractNameFromDisplayText(report.expenseTypeDisplayText);
                        break;
                    case 'Mileage':
                        name = this._extractNameFromDisplayText(report.mileageTypeDisplayText);
                        break;
                }

                return name ? `${type} - ${name}` : type;
            },

            /**
             * Extract name from display text by removing code prefix
             * e.g., "AZ - Arbeitszeit" -> "Arbeitszeit"
             * e.g., "Z12000007 - Prufung" -> "Prufung"
             * @private
             */
            _extractNameFromDisplayText(displayText) {
                if (!displayText || displayText === 'N/A') {
                    return '';
                }

                // If text contains " - ", take everything after it
                const separatorIndex = displayText.indexOf(' - ');
                if (separatorIndex !== -1) {
                    return displayText.substring(separatorIndex + 3);
                }

                return displayText;
            },

            /**
             * Get status state for activity
             * @private
             */
            _getStatusState(activity) {
                if (activity.executionStage === 'CLOSED' || activity.executionStage === 'CANCELLED') {
                    return 'None';
                }

                switch (activity.status) {
                    case 'OPEN': return 'Warning';
                    case 'COMPLETED': return 'Success';
                    default: return 'None';
                }
            },

            /**
             * Get execution stage state for ObjectStatus
             * @param {Object} activity - Activity data
             * @returns {string} State value
             * @private
             */
            _getStageState(activity) {
                switch (activity.executionStage) {
                    case 'CLOSED': return 'None';
                    case 'CANCELLED': return 'Error';
                    case 'EXECUTION': return 'Success';
                    case 'PLANNING': return 'Information';
                    default: return 'Information';
                }
            },

            /**
             * Format address into single string
             * @private
             */
            _formatAddress(address) {
                if (!address) return 'N/A';

                const parts = [];
                if (address.street) parts.push(address.street);
                if (address.streetNumber) parts.push(address.streetNumber);
                if (address.city) parts.push(address.city);

                return parts.length > 0 ? parts.join(' ') : 'N/A';
            },

            /* =========================================================================
             * UI EVENT HANDLERS
             * ========================================================================= */

            /**
             * Refresh view
             */
            onRefresh() {
                const model = this.getView().getModel("view");

                model.setProperty("/organizationSelected", false);
                model.setProperty("/userOrgLevelResolved", false);

                // Clear all service caches to ensure fresh data
                this._clearAllServiceCaches();

                this._resetActivityData();

                // Reload lookup data BEFORE loading activities
                // These must complete before T&M enrichment runs
                Promise.all([
                    this._loadTimeTasks(),
                    this._loadItems(),
                    this._loadExpenseTypes()
                ]).then(() => {
                    this._loadWebContainerContext().then(() => {
                        this._loadOrganizationLevels();
                    });
                });

                MessageToast.show(this._getText("msgViewRefreshed"));
            },

            /**
             * Handle product panel expand
             */
            onProductPanelExpand(oEvent) {
                const expanded = oEvent.getParameter("expand");
                const panel = oEvent.getSource();
                const bindingContext = panel.getBindingContext("view");

                if (bindingContext) {
                    const productPath = bindingContext.getPath();
                    const model = this.getView().getModel("view");
                    model.setProperty(productPath + "/expanded", expanded);
                }
            },

            /* =========================================================================
             * TYPE CONFIGURATION DIALOG HANDLERS
             * ========================================================================= */

            /**
             * Show Session Context info dialog.
             * Loads ContextInfoDialog fragment on first open, reuses on subsequent.
             */
            async onShowContextInfo() {
                if (!this._contextInfoDialog) {
                    this._contextInfoDialog = await Fragment.load({
                        name: "com.tng.fsm.timematerialext.app.view.fragments.ContextInfoDialog",
                        controller: this
                    });
                    this.getView().addDependent(this._contextInfoDialog);
                }
                this._contextInfoDialog.open();
            },

            /**
             * Close Context Info dialog
             */
            onCloseContextInfoDialog() {
                if (this._contextInfoDialog) {
                    this._contextInfoDialog.close();
                }
            },

            /**
             * Show T&M Entry Status Legend dialog.
             * Loads StatusLegendDialog fragment on first open, reuses on subsequent.
             */
            async onShowStatusLegend() {
                if (!this._statusLegendDialog) {
                    this._statusLegendDialog = await Fragment.load({
                        name: "com.tng.fsm.timematerialext.app.view.fragments.StatusLegendDialog",
                        controller: this
                    });
                    this.getView().addDependent(this._statusLegendDialog);
                }
                this._statusLegendDialog.open();
            },

            /**
             * Close Status Legend dialog
             */
            onCloseStatusLegendDialog() {
                if (this._statusLegendDialog) {
                    this._statusLegendDialog.close();
                }
            },

            /**
             * Open Type Configuration Dialog
             */
            async onOpenTypeConfig() {
                if (!this._typeConfigDialog) {
                    this._typeConfigDialog = await Fragment.load({
                        name: "com.tng.fsm.timematerialext.app.view.fragments.TypeConfigDialog",
                        controller: this
                    });
                    this.getView().addDependent(this._typeConfigDialog);
                }

                // Refresh config from server before opening
                await TypeConfigService.refreshConfig();

                // Create model with current config
                const typeConfigModel = new JSONModel({
                    expenseTypes: [...TypeConfigService.getExpenseTypes()],
                    mileageTypes: [...TypeConfigService.getMileageTypes()],
                    busy: false
                });
                this._typeConfigDialog.setModel(typeConfigModel, "typeConfig");
                this._typeConfigDialog.open();
            },

            /**
             * Close Type Configuration Dialog
             */
            onCloseTypeConfig() {
                if (this._typeConfigDialog) {
                    this._typeConfigDialog.close();
                }
            },

            /**
             * Add Expense Type
             */
            async onAddExpenseType() {
                const dialog = this._typeConfigDialog;
                if (!dialog) return;

                // Find the expense input field
                const inputCtrl = dialog.getContent()[0]?.getItems()[1]?.getContent()[0]?.getItems()[0];
                if (!inputCtrl || !inputCtrl.getValue) return;

                const value = inputCtrl.getValue().trim().toUpperCase();
                if (!value) {
                    MessageToast.show(this._getText("msgEnterServiceProductId"));
                    return;
                }

                // Get current user for audit
                const viewModel = this.getView().getModel("view");
                const modifiedBy = viewModel?.getProperty("/webContainerContext/userName") || "unknown";

                this._setTypeConfigBusy(true);
                const result = await TypeConfigService.addExpenseType(value, modifiedBy);
                this._setTypeConfigBusy(false);

                if (result.success) {
                    this._refreshTypeConfigModel();
                    inputCtrl.setValue("");
                    MessageToast.show(this._getText("msgAddedExpenseType", [value]));
                } else {
                    MessageToast.show(result.message || this._getText("msgFailedAddType"));
                }
            },

            /**
             * Remove Expense Type
             */
            async onRemoveExpenseType(oEvent) {
                const context = oEvent.getSource().getBindingContext("typeConfig");
                if (!context) return;

                const typeId = context.getObject();
                const viewModel = this.getView().getModel("view");
                const modifiedBy = viewModel?.getProperty("/webContainerContext/userName") || "unknown";

                this._setTypeConfigBusy(true);
                const result = await TypeConfigService.removeExpenseType(typeId, modifiedBy);
                this._setTypeConfigBusy(false);

                if (result.success) {
                    this._refreshTypeConfigModel();
                    MessageToast.show(this._getText("msgRemovedExpenseType", [typeId]));
                } else {
                    MessageToast.show(result.message || this._getText("msgFailedRemoveType"));
                }
            },

            /**
             * Add Mileage Type
             */
            async onAddMileageType() {
                const dialog = this._typeConfigDialog;
                if (!dialog) return;

                // Find the mileage input field
                const inputCtrl = dialog.getContent()[0]?.getItems()[2]?.getContent()[0]?.getItems()[0];
                if (!inputCtrl || !inputCtrl.getValue) return;

                const value = inputCtrl.getValue().trim().toUpperCase();
                if (!value) {
                    MessageToast.show(this._getText("msgEnterServiceProductId"));
                    return;
                }

                const viewModel = this.getView().getModel("view");
                const modifiedBy = viewModel?.getProperty("/webContainerContext/userName") || "unknown";

                this._setTypeConfigBusy(true);
                const result = await TypeConfigService.addMileageType(value, modifiedBy);
                this._setTypeConfigBusy(false);

                if (result.success) {
                    this._refreshTypeConfigModel();
                    inputCtrl.setValue("");
                    MessageToast.show(this._getText("msgAddedMileageType", [value]));
                } else {
                    MessageToast.show(result.message || this._getText("msgFailedAddType"));
                }
            },

            /**
             * Remove Mileage Type
             */
            async onRemoveMileageType(oEvent) {
                const context = oEvent.getSource().getBindingContext("typeConfig");
                if (!context) return;

                const typeId = context.getObject();
                const viewModel = this.getView().getModel("view");
                const modifiedBy = viewModel?.getProperty("/webContainerContext/userName") || "unknown";

                this._setTypeConfigBusy(true);
                const result = await TypeConfigService.removeMileageType(typeId, modifiedBy);
                this._setTypeConfigBusy(false);

                if (result.success) {
                    this._refreshTypeConfigModel();
                    MessageToast.show(this._getText("msgRemovedMileageType", [typeId]));
                } else {
                    MessageToast.show(result.message || this._getText("msgFailedRemoveType"));
                }
            },

            /**
             * Reset Type Configuration to Defaults
             */
            onResetTypeConfig() {
                MessageBox.confirm(this._getText("msgResetConfigConfirm"), {
                    title: this._getText("msgResetConfigTitle"),
                    onClose: async (action) => {
                        if (action === MessageBox.Action.OK) {
                            const viewModel = this.getView().getModel("view");
                            const modifiedBy = viewModel?.getProperty("/webContainerContext/userName") || "unknown";

                            this._setTypeConfigBusy(true);
                            const result = await TypeConfigService.resetToDefaults(modifiedBy);
                            this._setTypeConfigBusy(false);

                            if (result.success) {
                                this._refreshTypeConfigModel();
                                MessageToast.show(this._getText("msgConfigResetSuccess"));
                            } else {
                                MessageToast.show(this._getText("msgConfigResetFailed"));
                            }
                        }
                    }
                });
            },

            /**
             * Set Type Config Dialog busy state
             * @param {boolean} busy - Busy state
             * @private
             */
            _setTypeConfigBusy(busy) {
                if (this._typeConfigDialog) {
                    const model = this._typeConfigDialog.getModel("typeConfig");
                    if (model) {
                        model.setProperty("/busy", busy);
                    }
                    this._typeConfigDialog.setBusy(busy);
                }
            },

            /**
             * Refresh Type Config Model
             * @private
             */
            _refreshTypeConfigModel() {
                if (this._typeConfigDialog) {
                    const model = this._typeConfigDialog.getModel("typeConfig");
                    if (model) {
                        model.setProperty("/expenseTypes", [...TypeConfigService.getExpenseTypes()]);
                        model.setProperty("/mileageTypes", [...TypeConfigService.getMileageTypes()]);
                    }
                }
            }

        }));
});