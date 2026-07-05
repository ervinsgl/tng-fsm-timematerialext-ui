/**
 * TMTimeEntryMixin.js
 * 
 * Mixin for Time Entry (AZ/FZ/WZ) table-based creation handlers.
 * Handles row operations, technician selection, and repeat date expansion.
 * 
 * Row Operations:
 * - onAddCreateTimeEntry(AZ|FZ|WZ) / onRemoveCreateTimeEntry(AZ|FZ|WZ) / onCopyCreateTimeEntry(AZ|FZ|WZ)
 * 
 * Technician Selection:
 * - onCreateTimeEntryTechnicianLiveChange: Filter suggestions as user types
 * - onCreateTimeEntrySuggestionSelect: Select single technician
 * - onCreateTimeEntryMultiTechnicianSelect: Select from multi-technician dropdown
 * - onTimeEntryTechnicianTokenUpdate: Handle token add/remove in MultiInput
 * 
 * Date & Repeat:
 * - onTimeEntryDateChange: Update date across related entries
 * - onRepeatCheckboxChange: Toggle repeat date range UI
 * - _generateDateRange: Expand start/end dates into daily array
 * 
 * @file TMTimeEntryMixin.js
 * @module com/tns/fsm/timematerialext/app/controller/mixin/TMTimeEntryMixin
 */
sap.ui.define([
    "sap/m/MessageToast",
    "com/tns/fsm/timematerialext/app/utils/services/TechnicianService"
], (MessageToast, TechnicianService) => {
    "use strict";

    return {

        /* ========================================
         * TIME ENTRY ADD HANDLERS
         * ======================================== */

        onAddCreateTimeEntryAZ() {
            this._addTimeEntry("AZ", "/timeEntriesAZ");
        },

        onAddCreateTimeEntryFZ() {
            this._addTimeEntry("FZ", "/timeEntriesFZ");
        },

        onAddCreateTimeEntryWZ() {
            this._addTimeEntry("WZ", "/timeEntriesWZ");
        },

        /**
         * Add time entry row
         * @private
         */
        _addTimeEntry(sType, sArrayPath) {
            const oModel = this._tmCreateDialog?.getModel("createTM");
            if (!oModel) {
                MessageToast.show(this._getText("msgModelNotInitialized"));
                return;
            }
            
            const aEntries = oModel.getProperty(sArrayPath) || [];
            
            // Get defaults
            const defaultTechId = oModel.getProperty("/defaultTechnicianId") || "";
            const defaultTechDisplay = oModel.getProperty("/defaultTechnicianDisplay") || "";
            const defaultTechExternalId = oModel.getProperty("/defaultTechnicianExternalId") || "";
            const defaultDate = oModel.getProperty("/defaultDate") || "";
            
            // Initialize selectedTechnicians with default technician
            const selectedTechnicians = [];
            if (defaultTechId && defaultTechDisplay) {
                selectedTechnicians.push({
                    id: defaultTechId,
                    externalId: defaultTechExternalId,
                    displayText: defaultTechDisplay
                });
            }
            
            // Get activityTechnicians for suggestions
            const aActivityTechnicians = oModel.getProperty("/activityTechnicians") || [];
            const selectedIds = new Set(selectedTechnicians.map(t => t.id));
            const initialSuggestions = aActivityTechnicians.filter(t => !selectedIds.has(t.id));
            
            const newEntry = {
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                timeType: sType,
                technicianId: defaultTechId,
                technicianExternalId: defaultTechExternalId,
                technicianDisplay: defaultTechDisplay,
                selectedTechnicians: selectedTechnicians,
                technicianSuggestions: initialSuggestions,
                taskCode: "",
                taskDisplay: "",
                durationHrs: 0,
                entryDate: defaultDate,
                repeatEnabled: false,
                repeatEndDate: "",
                remarks: ""
            };
            
            aEntries.push(newEntry);
            oModel.setProperty(sArrayPath, aEntries);
            oModel.refresh(true);
            const msgKey = sType === 'AZ' ? 'msgArbeitszeitEntryAdded' : sType === 'FZ' ? 'msgFahrzeitEntryAdded' : 'msgWartezeitEntryAdded';
            MessageToast.show(this._getText(msgKey));
        },

        /* ========================================
         * TIME ENTRY REMOVE HANDLERS
         * ======================================== */

        onRemoveCreateTimeEntryAZ(oEvent) {
            this._removeTimeEntry(oEvent, "/timeEntriesAZ");
        },

        onRemoveCreateTimeEntryFZ(oEvent) {
            this._removeTimeEntry(oEvent, "/timeEntriesFZ");
        },

        onRemoveCreateTimeEntryWZ(oEvent) {
            this._removeTimeEntry(oEvent, "/timeEntriesWZ");
        },

        /**
         * Remove time entry row
         * @private
         */
        _removeTimeEntry(oEvent, sArrayPath) {
            const oContext = oEvent.getSource().getBindingContext("createTM");
            if (!oContext) {
                MessageToast.show(this._getText("msgCouldNotIdentifyEntryToRemove"));
                return;
            }
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            const iIndex = parseInt(sPath.split("/").pop());
            const aEntries = oModel.getProperty(sArrayPath) || [];
            
            aEntries.splice(iIndex, 1);
            oModel.setProperty(sArrayPath, aEntries);
            oModel.refresh(true);
            MessageToast.show(this._getText("msgTimeEntryRemoved"));
        },

        /* ========================================
         * TIME ENTRY COPY HANDLERS
         * ======================================== */

        onCopyCreateTimeEntryAZ(oEvent) {
            this._copyTimeEntry(oEvent, "/timeEntriesAZ", "Arbeitszeit");
        },

        onCopyCreateTimeEntryFZ(oEvent) {
            this._copyTimeEntry(oEvent, "/timeEntriesFZ", "Fahrzeit");
        },

        onCopyCreateTimeEntryWZ(oEvent) {
            this._copyTimeEntry(oEvent, "/timeEntriesWZ", "Wartezeit");
        },

        /**
         * Copy time entry row
         * @private
         */
        _copyTimeEntry(oEvent, sArrayPath, sTypeName) {
            const oContext = oEvent.getSource().getBindingContext("createTM");
            if (!oContext) {
                MessageToast.show(this._getText("msgCouldNotIdentifyEntryToCopy"));
                return;
            }
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            const iIndex = parseInt(sPath.split("/").pop());
            const aEntries = oModel.getProperty(sArrayPath) || [];
            const oOriginal = aEntries[iIndex];
            
            // Deep clone technicians
            const copiedTechnicians = oOriginal.selectedTechnicians 
                ? oOriginal.selectedTechnicians.map(t => ({ ...t }))
                : [];
            
            // Get activity technicians and filter
            const aActivityTechnicians = oModel.getProperty("/activityTechnicians") || [];
            const selectedIds = new Set(copiedTechnicians.map(t => t.id));
            const initialSuggestions = aActivityTechnicians.filter(t => !selectedIds.has(t.id));
            
            const oCopy = {
                ...oOriginal,
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                selectedTechnicians: copiedTechnicians,
                technicianSuggestions: initialSuggestions,
                repeatEnabled: false,
                repeatEndDate: ""
            };
            
            aEntries.splice(iIndex + 1, 0, oCopy);
            oModel.setProperty(sArrayPath, aEntries);
            oModel.refresh(true);
            MessageToast.show(this._getText("msgTimeEntryCopied", [sTypeName]));
        },

        /* ========================================
         * TECHNICIAN SELECTION HANDLERS
         * ======================================== */

        onCreateTimeEntryTechnicianLiveChange(oEvent) {
            const sValue = (oEvent.getParameter("value") || "").toLowerCase();
            const oContext = oEvent.getSource().getBindingContext("createTM");
            if (!oContext) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            
            // Get activityTechnicians (responsible + supporting)
            const aActivityTechnicians = oModel.getProperty("/activityTechnicians") || [];
            const aSelectedTechnicians = oModel.getProperty(sPath + "/selectedTechnicians") || [];
            const selectedIds = new Set(aSelectedTechnicians.map(t => t.id));
            
            // Filter by search value and exclude selected
            let aSuggestions = aActivityTechnicians.filter(tech => {
                if (selectedIds.has(tech.id)) return false;
                if (!sValue || sValue.length < 1) return true;
                return tech.displayText.toLowerCase().includes(sValue);
            });
            
            oModel.setProperty(sPath + "/technicianSuggestions", aSuggestions);
        },

        onCreateTimeEntrySuggestionSelect(oEvent) {
            const oItem = oEvent.getParameter("selectedItem");
            if (!oItem) return;
            
            const oContext = oEvent.getSource().getBindingContext("createTM");
            if (!oContext) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            const sTechId = oItem.getKey();
            const sTechDisplay = oItem.getText();
            const oTech = TechnicianService.getTechnicianById(sTechId);
            
            oModel.setProperty(sPath + "/technicianId", sTechId);
            oModel.setProperty(sPath + "/technicianDisplay", sTechDisplay);
            oModel.setProperty(sPath + "/technicianExternalId", oTech?.externalId || "");
        },

        onCreateTimeEntryMultiTechnicianSelect(oEvent) {
            const oItem = oEvent.getParameter("selectedItem");
            if (!oItem) return;
            
            const oMultiInput = oEvent.getSource();
            const oContext = oMultiInput.getBindingContext("createTM");
            if (!oContext) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            
            const sTechId = oItem.getKey();
            const sTechDisplay = oItem.getText();
            
            // Get technician from activityTechnicians
            const aActivityTechnicians = oModel.getProperty("/activityTechnicians") || [];
            const oTech = aActivityTechnicians.find(t => t.id === sTechId);
            
            const aSelectedTechnicians = oModel.getProperty(sPath + "/selectedTechnicians") || [];
            
            // Check if already selected
            if (aSelectedTechnicians.some(t => t.id === sTechId)) {
                MessageToast.show(this._getText("msgTechnicianAlreadyAdded"));
                oMultiInput.setValue("");
                return;
            }
            
            aSelectedTechnicians.push({
                id: sTechId,
                externalId: oTech?.externalId || "",
                displayText: sTechDisplay
            });
            
            oModel.setProperty(sPath + "/selectedTechnicians", aSelectedTechnicians);
            oMultiInput.setValue("");
            // Rebuild suggestions from the full technician pool (responsible +
            // supporting) minus the now-selected, so removed technicians reappear.
            this._rebuildTechnicianSuggestions(oModel, sPath);
            this._refreshTechnicianInput(oMultiInput);
        },

        onTimeEntryTechnicianTokenUpdate(oEvent) {
            const sType = oEvent.getParameter("type");
            
            if (sType === "removed") {
                const aRemovedTokens = oEvent.getParameter("removedTokens") || [];
                const oContext = oEvent.getSource().getBindingContext("createTM");
                if (!oContext) return;
                
                const sPath = oContext.getPath();
                const oModel = this._tmCreateDialog.getModel("createTM");
                
                let aSelectedTechnicians = oModel.getProperty(sPath + "/selectedTechnicians") || [];
                const aRemovedIds = aRemovedTokens.map(token => token.getKey());
                aSelectedTechnicians = aSelectedTechnicians.filter(t => !aRemovedIds.includes(t.id));
                
                oModel.setProperty(sPath + "/selectedTechnicians", aSelectedTechnicians);
                // Rebuild suggestions so the just-removed technician (incl. the
                // responsible person) becomes selectable again.
                this._rebuildTechnicianSuggestions(oModel, sPath);
                this._refreshTechnicianInput(oEvent.getSource());
            }
        },

        /**
         * Rebuild a time entry's technician suggestion list from the full activity
         * technician pool (responsible + supporting), excluding the currently
         * selected technicians. Mirrors the liveChange filter but with no search
         * term, so it restores the complete available list after add/remove.
         *
         * @param {sap.ui.model.json.JSONModel} oModel the createTM model
         * @param {string} sPath binding path of the time entry row
         * @private
         */
        /* ========================================
         * DURATION: HOURS + FRACTION STEPPERS
         * durationHrs = wholeHours + fraction(0/0.25/0.5/0.75)
         * All handlers adjust the plain numeric model value (no text parsing of
         * decimals), so they are immune to comma/dot locale issues.
         * ======================================== */

        /**
         * Resolve the createTM binding context + current durationHrs for a row.
         * @private
         */
        _getDurationContext(oEvent) {
            const oSource = oEvent.getSource();
            const oContext = oSource.getBindingContext("createTM");
            if (!oContext) return null;
            const oModel = oContext.getModel();
            const sPath = oContext.getPath();
            const fTotal = parseFloat(oModel.getProperty(sPath + "/durationHrs")) || 0;
            const iHours = Math.floor(fTotal);
            let fFrac = fTotal - iHours;
            fFrac = Math.round(fFrac * 4) / 4;
            if (fFrac >= 1) fFrac = 0;
            return { oSource, oModel, sPath, fTotal, iHours, fFrac };
        },

        /** Increase whole hours by 1 (fraction unchanged). */
        onDurationHoursStepUp(oEvent) {
            const c = this._getDurationContext(oEvent);
            if (!c) return;
            c.oModel.setProperty(c.sPath + "/durationHrs", (c.iHours + 1) + c.fFrac);
        },

        /** Decrease whole hours by 1, clamped so total stays >= 0. */
        onDurationHoursStepDown(oEvent) {
            const c = this._getDurationContext(oEvent);
            if (!c) return;
            let iNextHours = c.iHours - 1;
            if (iNextHours < 0) iNextHours = 0;
            c.oModel.setProperty(c.sPath + "/durationHrs", iNextHours + c.fFrac);
        },

        /**
         * Keep the hours input a whole number as the user types: strip any
         * non-digit character so no decimal separator reaches the model.
         * Recombines with the existing fraction.
         */
        onDurationHoursLiveChange(oEvent) {
            const oInput = oEvent.getSource();
            const sValue = oEvent.getParameter("value") || "";
            const sClean = sValue.replace(/[^0-9]/g, "");
            if (sClean !== sValue) oInput.setValue(sClean);

            const oContext = oInput.getBindingContext("createTM");
            if (!oContext) return;
            const oModel = oContext.getModel();
            const sPath = oContext.getPath();
            const fTotal = parseFloat(oModel.getProperty(sPath + "/durationHrs")) || 0;
            let fFrac = fTotal - Math.floor(fTotal);
            fFrac = Math.round(fFrac * 4) / 4;
            if (fFrac >= 1) fFrac = 0;
            const iHours = parseInt(sClean, 10) || 0;
            oModel.setProperty(sPath + "/durationHrs", iHours + fFrac);
        },

        /**
         * Step the fraction up one quarter (0 -> 0.25 -> 0.5 -> 0.75 -> wrap to 0
         * and carry +1 hour, like a clock).
         */
        onDurationFractionStepUp(oEvent) {
            const c = this._getDurationContext(oEvent);
            if (!c) return;
            let fFrac = c.fFrac + 0.25;
            let iHours = c.iHours;
            if (fFrac >= 1) { fFrac = 0; iHours += 1; }
            c.oModel.setProperty(c.sPath + "/durationHrs", iHours + fFrac);
        },

        /**
         * Step the fraction down one quarter (0.75 -> 0.5 -> 0.25 -> 0 -> wrap to
         * 0.75 and borrow -1 hour). Clamped so total never goes below 0.
         */
        onDurationFractionStepDown(oEvent) {
            const c = this._getDurationContext(oEvent);
            if (!c) return;
            let fFrac = c.fFrac - 0.25;
            let iHours = c.iHours;
            if (fFrac < 0) {
                if (iHours > 0) { fFrac = 0.75; iHours -= 1; }
                else { fFrac = 0; } // already at 0 total, stay
            }
            c.oModel.setProperty(c.sPath + "/durationHrs", iHours + fFrac);
        },

        _rebuildTechnicianSuggestions(oModel, sPath) {
            const aActivityTechnicians = oModel.getProperty("/activityTechnicians") || [];
            const aSelected = oModel.getProperty(sPath + "/selectedTechnicians") || [];
            const selectedIds = new Set(aSelected.map(t => t.id));
            const aSuggestions = aActivityTechnicians.filter(t => !selectedIds.has(t.id));
            oModel.setProperty(sPath + "/technicianSuggestions", aSuggestions);
        },

        /**
         * Refresh a technician MultiInput's own bindings (tokens, suggestionItems,
         * valueState) WITHOUT a model-wide refresh.
         *
         * Why: oModel.refresh(true) forces every control bound to the model to
         * re-render, including the duration StepInput. Under a comma-decimal
         * locale, that re-render triggers a StepInput reformat bug that shifts
         * the decimal (0,75 -> 75,25 -> ...). Refreshing only this control's
         * bindings updates the technician tokens and suggestion list while
         * leaving the StepInput untouched.
         *
         * @param {sap.m.MultiInput} oMultiInput the technician input control
         * @private
         */
        _refreshTechnicianInput(oMultiInput) {
            if (!oMultiInput) return;
            try {
                const oTokensBinding = oMultiInput.getBinding("tokens");
                if (oTokensBinding) oTokensBinding.refresh(true);
            } catch (e) { /* no tokens binding */ }
            try {
                const oSuggBinding = oMultiInput.getBinding("suggestionItems");
                if (oSuggBinding) oSuggBinding.refresh(true);
            } catch (e) { /* no suggestions binding */ }
            try {
                const oVsBinding = oMultiInput.getBinding("valueState");
                if (oVsBinding && oVsBinding.checkUpdate) oVsBinding.checkUpdate(true);
            } catch (e) { /* no valueState binding */ }
        },

        /* ========================================
         * REPEAT DATE RANGE HANDLERS
         * ======================================== */

        onRepeatCheckboxChange(oEvent) {
            const bSelected = oEvent.getParameter("selected");
            const oContext = oEvent.getSource().getBindingContext("createTM");
            if (!oContext) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            
            if (!bSelected) {
                oModel.setProperty(sPath + "/repeatEndDate", "");
            }
        },

        onTimeEntryDateChange(oEvent) {
            const oContext = oEvent.getSource().getBindingContext("createTM");
            if (!oContext) return;
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            
            const sEntryDate = oModel.getProperty(sPath + "/entryDate");
            const sEndDate = oModel.getProperty(sPath + "/repeatEndDate");
            
            // Clear end date if now invalid
            if (sEntryDate && sEndDate && sEndDate <= sEntryDate) {
                oModel.setProperty(sPath + "/repeatEndDate", "");
            }
        },

        formatMinEndDate(sEntryDate) {
            if (!sEntryDate) return null;
            const oDate = new Date(sEntryDate);
            oDate.setDate(oDate.getDate() + 1);
            return oDate;
        },

        /**
         * Generate array of dates between start and end (inclusive)
         * @param {string} sStartDate - Start date yyyy-MM-dd
         * @param {string} sEndDate - End date yyyy-MM-dd
         * @returns {string[]} Array of date strings
         */
        _generateDateRange(sStartDate, sEndDate) {
            const dates = [];
            // Normalize both dates — handles dd.MM.yyyy from manual typing
            const normalize = (s) => {
                if (!s) return s;
                if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) { const p = s.split('.'); return `${p[2]}-${p[1]}-${p[0]}`; }
                if (/^\d{2}\.\d{2}\.\d{2}$/.test(s))  { const p = s.split('.'); return `20${p[2]}-${p[1]}-${p[0]}`; }
                return s;
            };
            const startDate = new Date(normalize(sStartDate));
            const endDate   = new Date(normalize(sEndDate));
            
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return [sStartDate];
            }
            
            const maxDays = 31;
            let currentDate = new Date(startDate);
            let dayCount = 0;
            
            while (currentDate <= endDate && dayCount < maxDays) {
                const year = currentDate.getFullYear();
                const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                const day = String(currentDate.getDate()).padStart(2, '0');
                dates.push(`${year}-${month}-${day}`);
                
                currentDate.setDate(currentDate.getDate() + 1);
                dayCount++;
            }
            
            return dates;
        }

    };
});