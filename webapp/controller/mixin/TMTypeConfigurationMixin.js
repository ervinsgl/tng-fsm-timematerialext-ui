/**
 * TMTypeConfigurationMixin.js
 *
 * Mixin containing the Type Configuration dialog - the UI for maintaining which
 * Service Product IDs count as Expense and which as Mileage.
 *
 * ============================================================================
 * CURRENTLY DORMANT - NO CONTROL CALLS THESE HANDLERS
 * ============================================================================
 * The footer settings button was switched to the User Settings dialog
 * (TMUserSettingMixin). This mixin is still mixed into the controller, so the
 * code stays live, compiled and refactorable - it simply has no caller.
 *
 * TO RE-ENABLE: point a button at .onOpenTypeConfig in TimeMaterialExt.view.xml.
 *   <Button text="{i18n>view1TypeConfig}" press=".onOpenTypeConfig"
 *           icon="sap-icon://action-settings"/>
 * The fragment (view/fragments/TypeConfigDialog.fragment.xml) and all i18n keys
 * are still in place; nothing else is needed.
 *
 * TO REMOVE ENTIRELY: drop this file from the controller's dependency list and
 * from its Object.assign - nothing else references it.
 *
 * NOTE: TypeConfigService itself is NOT dormant. It runs during startup and
 * classifies every activity as Expense / Mileage / Time & Material. Only the
 * editing UI is switched off; the lists stay editable through the
 * /api/v1/*-type-config endpoints.
 *
 * Fragment: view/fragments/TypeConfigDialog.fragment.xml
 * Model:    typeConfig (local to the dialog)
 *
 * @file TMTypeConfigurationMixin.js
 * @module com/tns/fsm/timematerialext/app/controller/mixin/TMTypeConfigurationMixin
 */
sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "com/tns/fsm/timematerialext/app/utils/services/TypeConfigService"
], (JSONModel, Fragment, MessageToast, MessageBox, TypeConfigService) => {
    "use strict";

    return {

        /* =========================================================================
         * DIALOG HANDLERS
         * ========================================================================= */

        /**
         * Open Type Configuration Dialog
         */
        async onOpenTypeConfig() {
            if (!this._typeConfigDialog) {
                this._typeConfigDialog = await Fragment.load({
                    name: "com.tns.fsm.timematerialext.app.view.fragments.TypeConfigDialog",
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

        /* =========================================================================
         * EXPENSE TYPES
         * ========================================================================= */

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

        /* =========================================================================
         * MILEAGE TYPES
         * ========================================================================= */

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

        /* =========================================================================
         * RESET & MODEL HELPERS
         * ========================================================================= */

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
    };
});