/**
 * TMMaterialMixin.js
 * 
 * Mixin for Material table-based creation handlers.
 * Handles add/remove/copy rows and quantity validation for material entries.
 * 
 * Row Operations:
 * - onAddCreateMaterialRow / onRemoveCreateMaterialRow / onCopyCreateMaterialRow
 * - onCreateMaterialTechnicianSelect: Technician dropdown for material
 * 
 * Quantity Validation:
 * - onMaterialQuantityChange: Validate quantity against activity remaining qty
 * - _updateMaterialQuantityStates: Set min/max ValueStates on quantity inputs
 * 
 * @file TMMaterialMixin.js
 * @module com/tng/fsm/timematerialext/app/controller/mixin/TMMaterialMixin
 */
sap.ui.define([
    "sap/m/MessageToast"
], (MessageToast) => {
    "use strict";

    return {

        /* ========================================
         * MATERIAL TABLE CREATION HANDLERS
         * ======================================== */

        /**
         * Add row to Material creation table
         */
        onAddCreateMaterialRow() {
            const oModel = this._tmCreateDialog?.getModel("createTM");
            if (!oModel) {
                MessageToast.show(this._getText("msgModelNotInitialized"));
                return;
            }
            
            const aMaterialEntries = oModel.getProperty("/materialEntries") || [];
            
            // Get defaults
            const defaultTechId = oModel.getProperty("/defaultTechnicianId") || "";
            const defaultTechDisplay = oModel.getProperty("/defaultTechnicianDisplay") || "";
            const defaultTechExternalId = oModel.getProperty("/defaultTechnicianExternalId") || "";
            const defaultDate = oModel.getProperty("/defaultDate") || "";
            const defaultItemId = oModel.getProperty("/defaultItemId") || "";
            const defaultItemExternalId = oModel.getProperty("/defaultItemExternalId") || "";
            const defaultItemDisplay = oModel.getProperty("/defaultItemDisplay") || "";
            
            const newEntry = {
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                technicianId: defaultTechId,
                technicianExternalId: defaultTechExternalId,
                technicianDisplay: defaultTechDisplay,
                itemId: defaultItemId,
                itemExternalId: defaultItemExternalId,
                itemDisplay: defaultItemDisplay,
                quantity: 1,
                quantityState: "None",
                entryDate: defaultDate,
                remarks: ""
            };
            
            aMaterialEntries.push(newEntry);
            oModel.setProperty("/materialEntries", aMaterialEntries);
            
            // Recalculate remaining and validate
            this._updateMaterialQuantityStates(oModel);
            
            oModel.refresh(true);
            console.log("Material entries now:", aMaterialEntries.length);
            MessageToast.show(this._getText("msgMaterialEntryAdded"));
        },

        /**
         * Remove row from Material creation table
         */
        onRemoveCreateMaterialRow(oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("createTM");
            
            if (!oContext) {
                MessageToast.show(this._getText("msgCouldNotIdentifyEntryToRemove"));
                return;
            }
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            const iIndex = parseInt(sPath.split("/").pop());
            const aMaterialEntries = oModel.getProperty("/materialEntries") || [];
            
            aMaterialEntries.splice(iIndex, 1);
            oModel.setProperty("/materialEntries", aMaterialEntries);
            
            // Recalculate remaining and validate
            this._updateMaterialQuantityStates(oModel);
            
            oModel.refresh(true);
            MessageToast.show(this._getText("msgMaterialEntryRemoved"));
        },

        /**
         * Copy row in Material creation table
         */
        onCopyCreateMaterialRow(oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("createTM");
            
            if (!oContext) {
                MessageToast.show(this._getText("msgCouldNotIdentifyEntryToCopy"));
                return;
            }
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            const iIndex = parseInt(sPath.split("/").pop());
            const aMaterialEntries = oModel.getProperty("/materialEntries") || [];
            const oOriginal = aMaterialEntries[iIndex];
            
            // Deep clone with new ID
            const oCopy = {
                ...oOriginal,
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                quantityState: "None"
            };
            
            // Insert copy after the original
            aMaterialEntries.splice(iIndex + 1, 0, oCopy);
            oModel.setProperty("/materialEntries", aMaterialEntries);
            
            // Recalculate remaining and validate
            this._updateMaterialQuantityStates(oModel);
            
            oModel.refresh(true);
            MessageToast.show(this._getText("msgMaterialEntryCopied"));
        },

        /**
         * Handle technician selection in Material creation table
         */
        onCreateMaterialTechnicianSelect(oEvent) {
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

        /**
         * Handle quantity change in Material creation table
         */
        onMaterialQuantityChange(oEvent) {
            const oModel = this._tmCreateDialog?.getModel("createTM");
            if (!oModel) return;
            
            // Use setTimeout to ensure model binding has completed before validation
            setTimeout(() => {
                this._updateMaterialQuantityStates(oModel);
            }, 0);
        },

        /**
         * Update quantity states and remaining quantity for all material entries
         * @private
         */
        _updateMaterialQuantityStates(oModel) {
            const plannedQty = parseFloat(oModel.getProperty("/plannedMaterialQty")) || 0;
            const reportedQty = parseFloat(oModel.getProperty("/reportedMaterialQty")) || 0;
            const aMaterialEntries = oModel.getProperty("/materialEntries") || [];
            
            // Calculate total quantity being created
            let totalCreatingQty = 0;
            aMaterialEntries.forEach(entry => {
                totalCreatingQty += parseFloat(entry.quantity) || 0;
            });
            
            // Calculate remaining after all current entries
            const remainingAfterCreation = Math.max(0, plannedQty - reportedQty - totalCreatingQty);
            oModel.setProperty("/remainingMaterialQty", remainingAfterCreation);
            
            // Update each entry's state
            // Show warning if total exceeds available
            const availableQty = plannedQty - reportedQty;
            aMaterialEntries.forEach((entry, index) => {
                const state = totalCreatingQty > availableQty ? "Warning" : "None";
                oModel.setProperty(`/materialEntries/${index}/quantityState`, state);
            });
        }

    };
});