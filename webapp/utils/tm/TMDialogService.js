/**
 * TMDialogService.js
 * 
 * Frontend service for managing T&M dialogs.
 * Handles opening, closing, and data preparation for T&M dialogs.
 * 
 * Key Features:
 * - Open T&M Reports Dialog (view existing reports)
 * - Open T&M Creation Dialog (create new entries)
 * - Initialize services and load lookup data
 * - Set default values from activity context
 * - Extract activity data from various sources
 * 
 * Dialogs Managed:
 * - TMReportsDialog: View existing T&M reports
 * - TMCreateDialog: Create new T&M entries
 * 
 * @file TMDialogService.js
 * @module com/tns/fsm/timematerialext/app/utils/tm/TMDialogService
 * @requires sap/ui/core/Fragment
 * @requires sap/ui/model/json/JSONModel
 * @requires sap/m/MessageToast
 * @requires com/tns/fsm/timematerialext/app/utils/services/TechnicianService
 * @requires com/tns/fsm/timematerialext/app/utils/tm/TMCreationService
 * @requires com/tns/fsm/timematerialext/app/utils/services/TimeTaskService
 * @requires com/tns/fsm/timematerialext/app/utils/services/ItemService
 * @requires com/tns/fsm/timematerialext/app/utils/services/ExpenseTypeService
 */
sap.ui.define([
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "com/tns/fsm/timematerialext/app/utils/services/TechnicianService",
    "com/tns/fsm/timematerialext/app/utils/tm/TMCreationService",
    "com/tns/fsm/timematerialext/app/utils/services/TimeTaskService",
    "com/tns/fsm/timematerialext/app/utils/services/ItemService",
    "com/tns/fsm/timematerialext/app/utils/services/ExpenseTypeService",
    "com/tns/fsm/timematerialext/app/utils/services/ActivityService",
    "com/tns/fsm/timematerialext/app/utils/services/TypeConfigService"
], (Fragment, JSONModel, MessageToast, TechnicianService, TMCreationService, TimeTaskService, ItemService, ExpenseTypeService, ActivityService, TypeConfigService) => {
    "use strict";

    return {
        /**
         * Reference to the controller.
         * @type {sap.ui.core.mvc.Controller|null}
         * @private
         */
        _controller: null,

        /**
         * Get i18n text with optional parameters
         * @param {string} key - i18n key
         * @param {Array} [args] - Optional arguments for placeholders
         * @returns {string} Translated text
         * @private
         */
        _getText(key, args) {
            if (this._controller) {
                const oBundle = this._controller.getOwnerComponent().getModel("i18n").getResourceBundle();
                return oBundle.getText(key, args);
            }
            return key; // Fallback to key if controller not available
        },

        /**
         * Initialize service with controller reference.
         * @param {sap.ui.core.mvc.Controller} controller - View controller
         */
        init(controller) {
            this._controller = controller;
        },

        /**
         * Open T&M Reports Dialog.
         * @param {Object} oActivity - Activity data object
         * @param {Array} reports - Array of T&M reports
         * @returns {Promise<void>}
         */
        async openTMReportsDialog(oActivity, reports) {
            if (!this._controller) {
                throw new Error("TMDialogService not initialized");
            }

            const oDialogModel = new JSONModel({
                activityId: oActivity.id,
                activityCode: oActivity.code,
                activitySubject: oActivity.subject,
                activityStatus: oActivity.status || 'N/A',
                activityExecutionStage: oActivity.executionStage || 'N/A',
                activityExternalId: oActivity.externalId || 'N/A',
                activityStatusState: oActivity.statusState || 'None',
                activityStageState: oActivity.stageState || 'None',
                orgLevelId: oActivity.orgLevelId || null,
                serviceProduct: oActivity.serviceProductDisplayText || 'N/A',
                serviceProductExternalId: oActivity.serviceProductId || null,
                reports: reports,
                reportCount: reports.length,
                plannedStartDate: oActivity.plannedStartDate || null,
                formattedStartDate: oActivity.formattedStartDate || 'N/A',
                formattedEndDate: oActivity.formattedEndDate || 'N/A',
                formattedDuration: oActivity.formattedDuration || 'N/A',
                itemTypeCode: oActivity.itemTypeCode || 'N/A',
                quantity: oActivity.quantity || 'N/A',
                quantityUoM: oActivity.quantityUoM || 'N/A',
                responsibleExternalId: oActivity.responsibleId || 'N/A',
                tmMaterialQtyReported: oActivity.tmMaterialQtyReported || 0
            });

            await this._openDialog("TMReportsDialog", oDialogModel, "dialog", "_tmReportsDialog");
        },

        /**
         * Open T&M Creation Dialog.
         * Initializes all required services and sets default values.
         * @param {Object} activityData - Activity data object
         * @returns {Promise<void>}
         */
        async openTMCreationDialog(activityData) {
            if (!this._controller) {
                throw new Error("TMDialogService not initialized");
            }

            // Initialize TechnicianService (needed for resolving person IDs to names)
            let defaultTechDisplay = "";
            let defaultTechId = "";
            let defaultTechExternalId = "";
            let activityTechnicians = []; // Dropdown list for activity-specific technicians
            const addedTechnicianIds = new Set(); // Track added IDs to avoid duplicates
            
            try {
                await TechnicianService.initialize();
                
                // Step 1: Add responsible from composite-tree data (always available, no extra API call)
                const responsibleExtId = activityData.responsibleExternalId;
                if (responsibleExtId && responsibleExtId !== 'N/A') {
                    const responsibleTech = TechnicianService.getTechnicianByExternalId(responsibleExtId);
                    if (responsibleTech) {
                        activityTechnicians.push({
                            id: responsibleTech.id,
                            externalId: responsibleTech.externalId,
                            displayText: responsibleTech.displayText,
                            isResponsible: true
                        });
                        addedTechnicianIds.add(responsibleTech.id);
                        
                        // Set as default
                        defaultTechId = responsibleTech.id;
                        defaultTechExternalId = responsibleTech.externalId;
                        defaultTechDisplay = responsibleTech.displayText;
                        TMCreationService.setDefaultTechnician(responsibleTech);
                    }
                }
                
                // Step 2: Fetch supportingPersons via API (may fail, but responsible is already added)
                try {
                    const technicianData = await ActivityService.fetchActivityTechnicians(activityData.activityId);
                    
                    // Add any responsibles from API that weren't already added (edge case)
                    for (const id of technicianData.responsibleIds) {
                        if (!addedTechnicianIds.has(id)) {
                            const tech = TechnicianService.getTechnicianById(id);
                            if (tech) {
                                activityTechnicians.push({
                                    id: tech.id,
                                    externalId: tech.externalId,
                                    displayText: tech.displayText,
                                    isResponsible: true
                                });
                                addedTechnicianIds.add(tech.id);
                            }
                        }
                    }
                    
                    // Add supporting persons
                    for (const id of technicianData.supportingPersonIds) {
                        if (!addedTechnicianIds.has(id)) {
                            const tech = TechnicianService.getTechnicianById(id);
                            if (tech) {
                                activityTechnicians.push({
                                    id: tech.id,
                                    externalId: tech.externalId,
                                    displayText: tech.displayText,
                                    isResponsible: false
                                });
                                addedTechnicianIds.add(tech.id);
                            }
                        }
                    }
                } catch (apiError) {
                    // Continue with just the responsible - dropdown will still work
                }
                
                // Set default if not already set (edge case: responsible lookup failed but API succeeded)
                if (!defaultTechId && activityTechnicians.length > 0) {
                    const firstTech = activityTechnicians[0];
                    defaultTechId = firstTech.id;
                    defaultTechExternalId = firstTech.externalId;
                    defaultTechDisplay = firstTech.displayText;
                    TMCreationService.setDefaultTechnician(firstTech);
                }
                
            } catch (error) {
                console.error('TMDialogService: Failed to initialize TechnicianService:', error);
                MessageToast.show(this._getText("msgWarningTechnicianData"));
            }

            // Parallel loading of lookup data (Time Tasks, Items, Expense Types)
            let taskSuggestions = [];
            let taskSuggestionsAZ = [];
            let taskSuggestionsFZ = [];
            let taskSuggestionsWZ = [];
            let itemSuggestions = [];
            let defaultItemDisplay = "";
            let defaultItemId = "";
            let defaultItemExternalId = "";
            let expenseTypeSuggestions = [];

            const [timeTasksResult, itemsResult, expenseTypesResult] = await Promise.allSettled([
                TimeTaskService.fetchTimeTasks(),
                ItemService.fetchItems(),
                ExpenseTypeService.fetchExpenseTypes()
            ]);

            // Process Time Tasks result
            if (timeTasksResult.status === 'fulfilled') {
                taskSuggestions = TimeTaskService.getTasksForDropdown();
                taskSuggestionsAZ = taskSuggestions.filter(task => task.code && task.code.startsWith('AZ'));
                taskSuggestionsFZ = taskSuggestions.filter(task => task.code && task.code.startsWith('FZ'));
                taskSuggestionsWZ = taskSuggestions.filter(task => task.code && task.code.startsWith('WZ'));
            } else {
                console.error('TMDialogService: Failed to load time tasks:', timeTasksResult.reason);
                MessageToast.show(this._getText("msgWarningTimeTasks"));
            }

            // Process Items result
            if (itemsResult.status === 'fulfilled') {
                itemSuggestions = ItemService.getAllForSuggestions();
                
                const serviceProductExtId = activityData.serviceProductExternalId;
                if (serviceProductExtId && serviceProductExtId !== 'N/A') {
                    const defaultItem = ItemService.getItemSuggestionByExternalId(serviceProductExtId);
                    if (defaultItem) {
                        defaultItemDisplay = defaultItem.displayText;
                        defaultItemId = defaultItem.id;
                        defaultItemExternalId = defaultItem.externalId;
                    }
                }
                
                TMCreationService.setDefaultItem({
                    id: defaultItemId,
                    externalId: defaultItemExternalId,
                    displayText: defaultItemDisplay
                });
            } else {
                console.error('TMDialogService: Failed to load items:', itemsResult.reason);
                MessageToast.show(this._getText("msgWarningItemSearch"));
            }

            // Process Expense Types result
            if (expenseTypesResult.status === 'fulfilled') {
                expenseTypeSuggestions = ExpenseTypeService.getExpenseTypesForDropdown();
                
                if (expenseTypeSuggestions.length > 0) {
                    // Match ExpenseType code to Activity's Service Product externalId
                    const serviceProductExtId = activityData.serviceProductExternalId;
                    let defaultExpType = expenseTypeSuggestions.find(et => et.code === serviceProductExtId);
                    
                    if (!defaultExpType) {
                        // Fallback to first expense type if no match
                        defaultExpType = expenseTypeSuggestions[0];
                    }
                    
                    TMCreationService.setDefaultExpenseType({
                        id: defaultExpType.key,
                        code: defaultExpType.code,
                        displayText: defaultExpType.text
                    });
                }
            } else {
                console.error('TMDialogService: Failed to load expense types:', expenseTypesResult.reason);
                MessageToast.show(this._getText("msgWarningExpenseTypes"));
            }

            // Parse quantity for max constraint and set default quantity
            let maxQuantity = 9999;
            let defaultQuantity = null;
            let plannedMaterialQty = 0;
            if (activityData.quantity && activityData.quantity !== 'N/A') {
                const parsed = parseFloat(activityData.quantity);
                if (!isNaN(parsed) && parsed > 0) {
                    maxQuantity = parsed;
                    defaultQuantity = parsed;
                    plannedMaterialQty = parsed;
                }
            }
            TMCreationService.setDefaultQuantity(defaultQuantity);
            
            // Calculate remaining material quantity
            const reportedMaterialQty = parseFloat(activityData.tmMaterialQtyReported) || 0;
            const remainingMaterialQty = Math.max(0, plannedMaterialQty - reportedMaterialQty);

            // Set activity planned start date for Time Effort entries
            TMCreationService.setActivityPlannedStartDate(activityData.plannedStartDate);

            // Get default expense type and mileage type for new entries
            const defaultExpenseType = TMCreationService.getDefaultExpenseType();
            const defaultItem = TMCreationService.getDefaultItem();

            // Determine entry type based on service product
            const serviceProductExtId = activityData.serviceProductExternalId;
            const isExpenseType = TypeConfigService.isExpenseType(serviceProductExtId);
            const isMileageType = TypeConfigService.isMileageType(serviceProductExtId);
            const isTimeMaterialType = TypeConfigService.isTimeMaterialType(serviceProductExtId);

            const oCreateTMDialogModel = new JSONModel({
                activityId: activityData.activityId,
                activityCode: activityData.activityCode,
                activitySubject: activityData.activitySubject,
                activityExternalId: activityData.activityExternalId,
                orgLevelId: activityData.orgLevelId,
                serviceProduct: activityData.serviceProduct,
                serviceProductExternalId: activityData.serviceProductExternalId,
                // Computed type flags for visibility binding
                isExpenseType: isExpenseType,
                isMileageType: isMileageType,
                isTimeMaterialType: isTimeMaterialType,
                plannedStartDate: activityData.plannedStartDate,
                formattedStartDate: activityData.formattedStartDate,
                formattedEndDate: activityData.formattedEndDate,
                formattedDuration: activityData.formattedDuration,
                itemTypeCode: activityData.itemTypeCode,
                quantity: activityData.quantity,
                quantityUoM: activityData.quantityUoM,
                maxQuantity: maxQuantity,
                // Material quantity tracking
                plannedMaterialQty: plannedMaterialQty,
                reportedMaterialQty: reportedMaterialQty,
                remainingMaterialQty: remainingMaterialQty,
                responsibleExternalId: activityData.responsibleExternalId,
                entries: [],
                activityTechnicians: activityTechnicians,
                defaultTechnicianId: defaultTechId,
                defaultTechnicianDisplay: defaultTechDisplay,
                defaultTechnicianExternalId: defaultTechExternalId,
                itemSuggestions: itemSuggestions,
                taskSuggestions: taskSuggestions,
                taskSuggestionsAZ: taskSuggestionsAZ,
                taskSuggestionsFZ: taskSuggestionsFZ,
                taskSuggestionsWZ: taskSuggestionsWZ,
                expenseTypeSuggestions: expenseTypeSuggestions,
                // New table-based creation arrays
                expenseEntries: [],
                mileageEntries: [],
                materialEntries: [],
                timeEntriesAZ: [],
                timeEntriesFZ: [],
                timeEntriesWZ: [],
                technicianSuggestions: [],
                // Default values for new entries
                defaultExpenseTypeId: defaultExpenseType?.id || "",
                defaultExpenseTypeCode: defaultExpenseType?.code || "",
                defaultExpenseTypeDisplay: defaultExpenseType?.displayText || "",
                defaultMileageTypeId: defaultItem?.id || "",
                defaultMileageTypeExternalId: defaultItem?.externalId || "",
                defaultMileageTypeDisplay: defaultItem?.displayText || "",
                // Default item for Material
                defaultItemId: defaultItem?.id || "",
                defaultItemExternalId: defaultItem?.externalId || "",
                defaultItemDisplay: defaultItem?.displayText || "",
                // Default date from activity
                defaultDate: activityData.plannedStartDate ? activityData.plannedStartDate.split('T')[0] : "",
                // Today's date for maxDate binding on DatePickers — set once, avoids re-render floods
                todayDate: (() => { const d = new Date(); d.setHours(23,59,59,999); return d; })()
            });

            await this._openDialog("TMCreateDialog", oCreateTMDialogModel, "createTM", "_tmCreateDialog");
        },

        /**
         * Generic dialog opener.
         * @param {string} fragmentName - Fragment name without path
         * @param {sap.ui.model.json.JSONModel} model - Dialog model
         * @param {string} modelName - Model name for binding
         * @param {string} dialogProperty - Controller property to store dialog
         * @returns {Promise<void>}
         * @private
         */
        async _openDialog(fragmentName, model, modelName, dialogProperty) {
            if (!this._controller[dialogProperty]) {
                this._controller[dialogProperty] = await Fragment.load({
                    name: `com.tns.fsm.timematerialext.app.view.fragments.${fragmentName}`,
                    controller: this._controller
                });
                this._controller.getView().addDependent(this._controller[dialogProperty]);
            }

            this._controller[dialogProperty].setModel(model, modelName);
            this._controller[dialogProperty].open();
        },

        /**
         * Close T&M Reports Dialog.
         */
        closeTMReportsDialog() {
            if (this._controller && this._controller._tmReportsDialog) {
                this._controller._tmReportsDialog.close();
            }
        },

        /**
         * Close T&M Creation Dialog and reset state.
         */
        closeTMCreationDialog() {
            if (this._controller && this._controller._tmCreateDialog) {
                this._controller._tmCreateDialog.close();
                
                const oModel = this._controller._tmCreateDialog.getModel("createTM");
                if (oModel) {
                    oModel.setProperty("/entries", []);
                    oModel.setProperty("/expenseEntries", []);
                    oModel.setProperty("/mileageEntries", []);
                    oModel.setProperty("/materialEntries", []);
                    oModel.setProperty("/timeEntriesAZ", []);
                    oModel.setProperty("/timeEntriesFZ", []);
                    oModel.setProperty("/timeEntriesWZ", []);
                    oModel.setProperty("/technicianSuggestions", []);
                }
                
                TMCreationService.clearDefaultTechnician();
                TMCreationService.clearDefaultItem();
                TMCreationService.clearDefaultExpenseType();
            }
        },

        /**
         * Extract activity data for dialog from context or existing dialog.
         * @param {sap.ui.model.Context|null} oContext - Binding context from view
         * @param {sap.m.Dialog|null} tmReportsDialog - Reference to T&M Reports Dialog
         * @returns {Object} Activity data object
         */
        extractActivityData(oContext, tmReportsDialog) {
            let activityData = {};

            if (oContext) {
                const oActivity = oContext.getObject();
                activityData = {
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
            } else if (tmReportsDialog) {
                const oDialogModel = tmReportsDialog.getModel("dialog");
                if (oDialogModel) {
                    activityData = {
                        activityId: oDialogModel.getProperty("/activityId"),
                        activityCode: oDialogModel.getProperty("/activityCode"),
                        activitySubject: oDialogModel.getProperty("/activitySubject"),
                        activityExternalId: oDialogModel.getProperty("/activityExternalId") || 'N/A',
                        orgLevelId: oDialogModel.getProperty("/orgLevelId") || null,
                        serviceProduct: oDialogModel.getProperty("/serviceProduct") || 'N/A',
                        serviceProductExternalId: oDialogModel.getProperty("/serviceProductExternalId") || null,
                        plannedStartDate: oDialogModel.getProperty("/plannedStartDate") || null,
                        formattedStartDate: oDialogModel.getProperty("/formattedStartDate") || 'N/A',
                        formattedEndDate: oDialogModel.getProperty("/formattedEndDate") || 'N/A',
                        formattedDuration: oDialogModel.getProperty("/formattedDuration") || 'N/A',
                        itemTypeCode: oDialogModel.getProperty("/itemTypeCode") || 'N/A',
                        quantity: oDialogModel.getProperty("/quantity") || 'N/A',
                        quantityUoM: oDialogModel.getProperty("/quantityUoM") || 'N/A',
                        responsibleExternalId: oDialogModel.getProperty("/responsibleExternalId") || 'N/A',
                        tmMaterialQtyReported: oDialogModel.getProperty("/tmMaterialQtyReported") || 0
                    };
                }
            }

            return activityData;
        }
    };
});