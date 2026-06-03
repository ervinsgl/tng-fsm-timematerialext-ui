/**
 * TechnicianMixin.js
 * 
 * Mixin containing technician selection, task selection, and duration
 * handlers for the T&M Creation Dialog.
 * 
 * Handlers:
 * - onTechnicianSelect: Technician dropdown selection (single entry mode)
 * - onTaskSelect: Task type dropdown selection (AZ/FZ/WZ)
 * - onTimeEntryTechnicianLiveChange: Filter technician suggestions in time entry table
 * - onTimeEntryTechnicianSuggestionSelect: Select technician from suggestions
 * - onTimeEffortDurationChange: Convert hours to minutes when duration StepInput changes
 * 
 * @file TechnicianMixin.js
 * @module com/tns/fsm/timematerialext/app/controller/mixin/TechnicianMixin
 */
sap.ui.define([
    "com/tns/fsm/timematerialext/app/utils/services/TechnicianService"
], (TechnicianService) => {
    "use strict";

    return {

        /* ========================================
         * TECHNICIAN SELECTION HANDLERS
         * ======================================== */

        /**
         * Handle technician selection from ComboBox/Select
         */
        onTechnicianSelect(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const oControl = oEvent.getSource();
            const oContext = oControl.getBindingContext("createTM");
            
            if (!oContext) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            
            if (oSelectedItem) {
                const oItemContext = oSelectedItem.getBindingContext("createTM");
                if (oItemContext) {
                    const oTechnician = oItemContext.getObject();
                    oModel.setProperty(sPath + "/technicianId", oTechnician.id);
                    oModel.setProperty(sPath + "/technicianExternalId", oTechnician.externalId);
                    oModel.setProperty(sPath + "/technicianDisplay", oTechnician.displayText);
                }
            } else {
                oModel.setProperty(sPath + "/technicianId", "");
                oModel.setProperty(sPath + "/technicianExternalId", "");
                oModel.setProperty(sPath + "/technicianDisplay", "");
            }
        },

        /* ========================================
         * TASK SELECTION HANDLERS
         * ======================================== */

        /**
         * Handle task selection from Select dropdown
         */
        onTaskSelect(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const oSelect = oEvent.getSource();
            const oContext = oSelect.getBindingContext("createTM");
            
            if (!oContext || !oSelectedItem) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            const oItemContext = oSelectedItem.getBindingContext("createTM");
            
            if (oItemContext) {
                const oTask = oItemContext.getObject();
                const sBinding = oSelect.getBindingPath("selectedKey");
                
                if (sBinding) {
                    const sDisplayPath = sBinding.replace("Code", "Display");
                    oModel.setProperty(sPath + "/" + sDisplayPath, oTask.name);
                }
            }
        },

        /* ========================================
         * TIME ENTRY TECHNICIAN SEARCH HANDLERS
         * ======================================== */

        /**
         * Handle technician live change for time entries.
         * Uses entry-local suggestions path to avoid cross-entry interference.
         */
        onTimeEntryTechnicianLiveChange(oEvent) {
            const sValue = oEvent.getParameter("value") || "";
            const oInput = oEvent.getSource();
            const oContext = oInput.getBindingContext("createTM");
            
            if (!oContext) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            
            // Search all technicians and set on THIS entry's local path
            const aSuggestions = TechnicianService.searchTechnicians(sValue);
            oModel.setProperty(sPath + "/technicianSuggestions", aSuggestions);
        },

        /**
         * Handle technician suggestion selection for time entries
         */
        onTimeEntryTechnicianSuggestionSelect(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const oInput = oEvent.getSource();
            const oContext = oInput.getBindingContext("createTM");
            
            if (!oContext) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            
            if (oSelectedItem) {
                const oItemContext = oSelectedItem.getBindingContext("createTM");
                if (oItemContext) {
                    const oTechnician = oItemContext.getObject();
                    oModel.setProperty(sPath + "/technicianId", oTechnician.id);
                    oModel.setProperty(sPath + "/technicianExternalId", oTechnician.externalId);
                    oModel.setProperty(sPath + "/technicianDisplay", oTechnician.displayText);
                }
            }
        },

        /* ========================================
         * TIME ENTRY DURATION HANDLERS
         * ======================================== */

        /**
         * Handle duration change for time entries.
         * Converts hours (UI display) to minutes (backend storage).
         */
        onTimeEffortDurationChange(oEvent) {
            const oStepInput = oEvent.getSource();
            const oContext = oStepInput.getBindingContext("createTM");
            
            if (!oContext) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            const durationHours = oEvent.getParameter("value") || 0;
            
            // Convert hours to minutes for backend
            const durationMinutes = Math.round(durationHours * 60);
            oModel.setProperty(sPath + "/duration", durationMinutes);
        }

    };
});