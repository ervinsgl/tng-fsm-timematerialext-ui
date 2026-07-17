/**
 * TMTableMixin.js
 * 
 * Mixin for T&M table view handlers.
 * Handles filtering, sorting, edit selected, and save all operations.
 * 
 * @file TMTableMixin.js
 * @module com/tns/fsm/timematerialext/app/controller/mixin/TMTableMixin
 */
sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/ui/core/Fragment",
    "sap/m/ViewSettingsItem",
    "com/tns/fsm/timematerialext/app/utils/services/ApprovalService"
], (MessageToast, MessageBox, Filter, FilterOperator, Sorter, Fragment, ViewSettingsItem, ApprovalService) => {
    "use strict";

    return {

        /* ========================================
         * T&M DYNAMIC TIME EFFORTS (LEGACY)
         * ======================================== */

        onAddTimeEffortFZ(oEvent) {
            this._addTimeEffort(oEvent, "FZ", "timeEffortsFZ");
        },

        onAddTimeEffortWZ(oEvent) {
            this._addTimeEffort(oEvent, "WZ", "timeEffortsWZ");
        },

        onAddTimeEffortAZ(oEvent) {
            this._addTimeEffort(oEvent, "AZ", "timeEffortsAZ");
        },

        onRemoveTimeEffortFZ(oEvent) {
            this._removeTimeEffort(oEvent, "timeEffortsFZ");
        },

        onRemoveTimeEffortWZ(oEvent) {
            this._removeTimeEffort(oEvent, "timeEffortsWZ");
        },

        onRemoveTimeEffortAZ(oEvent) {
            this._removeTimeEffort(oEvent, "timeEffortsAZ");
        },

        _addTimeEffort(oEvent, sType, sArrayProperty) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("createTM");
            
            if (!oContext) {
                MessageToast.show(this._getText("msgEntryContextNotAvailable"));
                return;
            }
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            const oEntry = oModel.getProperty(sPath);
            
            const aTimeEfforts = oEntry[sArrayProperty] || [];
            
            const newTimeEffort = {
                id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: sType,
                taskCode: "",
                taskDisplay: "",
                duration: 30,
                technicianId: oEntry.technicianId || "",
                technicianExternalId: oEntry.technicianExternalId || "",
                technicianDisplay: oEntry.technicianDisplay || "",
                remarks: ""
            };
            
            aTimeEfforts.push(newTimeEffort);
            oModel.setProperty(sPath + "/" + sArrayProperty, aTimeEfforts);
            
            MessageToast.show(this._getText("msgTimeEffortAdded", [sType]));
        },

        _removeTimeEffort(oEvent, sArrayProperty) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext("createTM");
            
            if (!oContext) {
                MessageToast.show(this._getText("msgEntryContextNotAvailable"));
                return;
            }
            
            const sPath = oContext.getPath();
            const oModel = this._tmCreateDialog.getModel("createTM");
            
            const match = sPath.match(/(\/entries\/\d+)\/(\w+)\/(\d+)/);
            if (match) {
                const sEntryPath = match[1];
                const sProperty = match[2];
                const iIndex = parseInt(match[3]);
                
                const aTimeEfforts = oModel.getProperty(sEntryPath + "/" + sProperty) || [];
                aTimeEfforts.splice(iIndex, 1);
                oModel.setProperty(sEntryPath + "/" + sProperty, aTimeEfforts);
                
                MessageToast.show(this._getText("msgTimeEffortRemoved"));
            }
        },

        /* ========================================
         * HELPER: GET TABLE FROM TOOLBAR
         * ======================================== */

        /**
         * Get the Table from a toolbar control (handles ScrollContainer wrapper)
         * Navigation: Control -> Toolbar -> Panel -> Content -> [ScrollContainer] Table
         * @private
         */
        _getTableFromToolbarControl(oControl) {
            const oToolbar = oControl.getParent();
            const oPanel = oToolbar ? oToolbar.getParent() : null;
            
            if (!oPanel || !oPanel.getContent) return null;
            
            const aContent = oPanel.getContent();
            // Handle ScrollContainer wrapper - table may be direct child or inside ScrollContainer
            let oTable = aContent && aContent.length > 0 ? aContent[0] : null;
            if (oTable && oTable.getContent && !oTable.getBinding("items")) {
                // It's a ScrollContainer, get its content
                const aScrollContent = oTable.getContent();
                oTable = aScrollContent && aScrollContent.length > 0 ? aScrollContent[0] : null;
            }
            
            return oTable;
        },

        /**
         * Get activity path from a toolbar control
         * @private
         */
        _getActivityPathFromToolbarControl(oControl) {
            // Navigate up to find activity context
            let oParent = oControl;
            while (oParent) {
                const oContext = oParent.getBindingContext?.("view");
                if (oContext) {
                    const sPath = oContext.getPath();
                    if (sPath && sPath.includes("/activities/")) {
                        return sPath;
                    }
                }
                oParent = oParent.getParent?.();
            }
            return null;
        },

        /**
         * Get the edit mode property name based on table contents
         * @private
         */
        _getEditModeProperty(oTable) {
            const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
            if (!oBinding) return "tmEditMode";
            
            const aContexts = oBinding.getContexts();
            if (aContexts.length > 0) {
                const firstItem = aContexts[0].getObject();
                const type = firstItem?.type;
                
                if (type === "Expense" || type === "Expense Report") {
                    return "expenseEditMode";
                } else if (type === "Mileage") {
                    return "mileageEditMode";
                }
            }
            return "tmEditMode";
        },

        /* ========================================
         * TABLE FILTER HANDLER
         * ======================================== */

        /**
         * Handle T&M type filter change (SegmentedButton: All / Time Effort / Material)
         * Stores the sub-filter key on the table and re-applies all filters via shared helper.
         */
        onTMTypeFilterChange(oEvent) {
            const sKey = oEvent.getParameter("item").getKey();
            const oButton = oEvent.getSource();
            
            const oTable = this._getTableFromToolbarControl(oButton);
            if (!oTable || !oTable.getBinding) return;
            
            // Store sub-filter key so it survives dialog-based filter changes
            oTable.data("typeSubFilter", sKey);
            
            // Re-apply all filters (base type + sub-filter + user filters)
            this._applyTableFilters(oTable, "TM");
        },

        /* ========================================
         * TABLE SORT DIALOG
         * ======================================== */

        /**
         * Sort configuration for each table type
         * @private
         */
        _getSortConfig() {
            return {
                // Time & Material table sort fields
                "TM": [
                    { key: "sortDate", text: "sortByDate" },
                    { key: "type", text: "sortByType" },
                    { key: "taskDisplayText", text: "sortByDescription" },
                    { key: "createPersonDisplayText", text: "sortByTechnician" },
                    { key: "durationHrs", text: "sortByTime" },
                    { key: "quantity", text: "sortByQuantity" },
                    { key: "decisionStatus", text: "sortByStatus" }
                ],
                // Expense table sort fields
                "Expense": [
                    { key: "sortDate", text: "sortByDate" },
                    { key: "expenseTypeDisplayText", text: "sortByType" },
                    { key: "createPersonDisplayText", text: "sortByTechnician" },
                    { key: "externalAmountValue", text: "sortByAmount" },
                    { key: "decisionStatus", text: "sortByStatus" }
                ],
                // Mileage table sort fields
                "Mileage": [
                    { key: "sortDate", text: "sortByDate" },
                    { key: "mileageTypeDisplayText", text: "sortByType" },
                    { key: "createPersonDisplayText", text: "sortByTechnician" },
                    { key: "distanceValue", text: "sortByDistance" },
                    { key: "decisionStatus", text: "sortByStatus" }
                ]
            };
        },

        /**
         * Open sort & filter dialog for table
         * @param {sap.ui.base.Event} oEvent - Button press event
         */
        async onOpenSortDialog(oEvent) {
            const oButton = oEvent.getSource();
            const oTable = this._getTableFromToolbarControl(oButton);
            
            if (!oTable) {
                MessageToast.show(this._getText("msgTableNotFound"));
                return;
            }
            
            // Determine table type from custom data or parent context
            const sTableType = oButton.data("tableType") || "TM";
            
            // Load fragment on first open, reuse on subsequent
            if (!this._oSortDialog) {
                this._oSortDialog = await Fragment.load({
                    name: "com.tns.fsm.timematerialext.app.view.fragments.TMSortDialog",
                    controller: this
                });
                this.getView().addDependent(this._oSortDialog);
            }
            
            // Store reference to current table and type
            this._oSortDialog.data("currentTable", oTable);
            this._oSortDialog.data("tableType", sTableType);
            
            // ── SORT ITEMS ──────────────────────────────────────────
            this._oSortDialog.removeAllSortItems();
            
            const aSortConfig = this._getSortConfig()[sTableType] || this._getSortConfig()["TM"];
            
            const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
            let sCurrentSortKey = null;
            let bCurrentDescending = true;
            
            if (oBinding && oBinding.aSorters && oBinding.aSorters.length > 0) {
                sCurrentSortKey = oBinding.aSorters[0].sPath;
                bCurrentDescending = oBinding.aSorters[0].bDescending;
            }
            
            aSortConfig.forEach((oConfig, index) => {
                const oItem = new ViewSettingsItem({
                    key: oConfig.key,
                    text: this._getText(oConfig.text),
                    selected: oConfig.key === sCurrentSortKey || (index === 0 && !sCurrentSortKey)
                });
                this._oSortDialog.addSortItem(oItem);
            });
            
            this._oSortDialog.setSortDescending(sCurrentSortKey ? bCurrentDescending : true);
            
            // ── TECHNICIAN FILTER ITEMS (dynamic per table) ─────────
            // Remove old technician group and rebuild from current binding data
            const aExistingFilterItems = this._oSortDialog.getFilterItems();
            const oOldTechGroup = aExistingFilterItems.find(item => item.getKey() === "technician");
            if (oOldTechGroup) {
                this._oSortDialog.removeFilterItem(oOldTechGroup);
            }
            
            // Collect unique technician names from all (unfiltered) binding contexts
            const aAllContexts = oBinding ? oBinding.getContexts(0, oBinding.getLength()) : [];
            const aAllData = aAllContexts.map(ctx => ctx.getObject());
            
            // Also read directly from model to get unfiltered technicians
            const oModel = this.getView().getModel("view");
            const sActivityPath = this._getActivityPathFromTable(oTable);
            let aTechnicianNames = [];
            
            if (sActivityPath) {
                const aReports = oModel.getProperty(sActivityPath + "/tmReports") || [];
                const oNames = {};
                aReports.forEach(r => {
                    const sName = r.createPersonDisplayText;
                    if (sName && !oNames[sName]) {
                        oNames[sName] = true;
                        aTechnicianNames.push(sName);
                    }
                });
                aTechnicianNames.sort();
            } else {
                // Fallback: use visible binding contexts
                const oNames = {};
                aAllData.forEach(r => {
                    const sName = r.createPersonDisplayText;
                    if (sName && !oNames[sName]) {
                        oNames[sName] = true;
                        aTechnicianNames.push(sName);
                    }
                });
                aTechnicianNames.sort();
            }
            
            if (aTechnicianNames.length > 0) {
                const { ViewSettingsFilterItem } = sap.m;
                const oTechGroup = new ViewSettingsFilterItem({
                    key: "technician",
                    text: this._getText("filterByTechnician"),
                    multiSelect: true
                });
                
                // Restore previously active technician filter keys for this table
                const oActiveFilters = oTable.data("activeFilters") || {};
                const aActiveTechKeys = oActiveFilters.technicianKeys || [];
                
                aTechnicianNames.forEach(sName => {
                    oTechGroup.addItem(new ViewSettingsItem({
                        key: sName,
                        text: sName,
                        selected: aActiveTechKeys.includes(sName)
                    }));
                });
                
                this._oSortDialog.addFilterItem(oTechGroup);
            }
            
            // Restore status filter selections for this table
            const oActiveFilters = oTable.data("activeFilters") || {};
            const aActiveStatusKeys = oActiveFilters.statusKeys || [];
            const oStatusGroup = this._oSortDialog.getFilterItems().find(item => item.getKey() === "status");
            if (oStatusGroup) {
                oStatusGroup.getItems().forEach(oItem => {
                    oItem.setSelected(aActiveStatusKeys.includes(oItem.getKey()));
                });
            }
            
            this._oSortDialog.open();
        },

        /**
         * Handle sort & filter dialog confirm
         * @param {sap.ui.base.Event} oEvent - Confirm event
         */
        onTMSortDialogConfirm(oEvent) {
            const oSortItem = oEvent.getParameter("sortItem");
            const bDescending = oEvent.getParameter("sortDescending");
            const aFilterItems = oEvent.getParameter("filterItems") || [];
            
            const oTable = this._oSortDialog.data("currentTable");
            const sTableType = this._oSortDialog.data("tableType");
            if (!oTable) return;
            
            const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
            if (!oBinding) return;
            
            // ── APPLY SORT ───────────────────────────────────────────
            if (oSortItem) {
                const oSorter = new Sorter(oSortItem.getKey(), bDescending);
                oBinding.sort(oSorter);
            }
            
            // ── COLLECT & STORE FILTER SELECTIONS ───────────────────
            const aStatusKeys = [];
            const aTechnicianKeys = [];
            
            aFilterItems.forEach(oItem => {
                const sGroupKey = oItem.getParent ? oItem.getParent().getKey() : null;
                if (sGroupKey === "status") {
                    aStatusKeys.push(oItem.getKey());
                } else if (sGroupKey === "technician") {
                    aTechnicianKeys.push(oItem.getKey());
                }
            });
            
            // Persist active filter state on the table element
            oTable.data("activeFilters", { statusKeys: aStatusKeys, technicianKeys: aTechnicianKeys });
            
            // ── APPLY FILTERS ────────────────────────────────────────
            this._applyTableFilters(oTable, sTableType);
            
            // ── FEEDBACK ─────────────────────────────────────────────
            const iFilterCount = aStatusKeys.length + aTechnicianKeys.length;
            if (oSortItem && iFilterCount > 0) {
                const sDirection = bDescending ? this._getText("sortDescending") : this._getText("sortAscending");
                MessageToast.show(this._getText("msgSortAndFilterApplied", [oSortItem.getText(), sDirection, iFilterCount]));
            } else if (oSortItem) {
                const sDirection = bDescending ? this._getText("sortDescending") : this._getText("sortAscending");
                MessageToast.show(this._getText("msgSortApplied", [oSortItem.getText(), sDirection]));
            } else if (iFilterCount > 0) {
                MessageToast.show(this._getText("msgFilterApplied", [iFilterCount]));
            }
        },

        /**
         * Handle sort dialog cancel
         */
        onTMSortDialogCancel() {
            // Dialog closes automatically, no action needed
        },

        /**
         * Handle sort & filter dialog reset — clears both sort and filters
         * @param {sap.ui.base.Event} oEvent - Reset event
         */
        onTMSortDialogReset(oEvent) {
            const oTable = this._oSortDialog.data("currentTable");
            const sTableType = this._oSortDialog.data("tableType");
            
            if (!oTable) return;
            
            const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
            if (!oBinding) return;
            
            // Reset sort to default (first field, descending)
            const aSortConfig = this._getSortConfig()[sTableType] || this._getSortConfig()["TM"];
            const oSorter = new Sorter(aSortConfig[0].key, true);
            oBinding.sort(oSorter);
            
            const aSortItems = this._oSortDialog.getSortItems();
            aSortItems.forEach((oItem, index) => oItem.setSelected(index === 0));
            this._oSortDialog.setSortDescending(true);
            
            // Clear stored filter state and re-apply (only base type filters remain)
            oTable.data("activeFilters", { statusKeys: [], technicianKeys: [] });
            if (sTableType === "TM") {
                oTable.data("typeSubFilter", "ALL");
            }
            this._applyTableFilters(oTable, sTableType);
            
            MessageToast.show(this._getText("msgSortFilterReset"));
        },

        /**
         * Legacy handler for Select-based sort (kept for backward compatibility)
         * @deprecated Use onOpenSortDialog instead
         */
        onTMSortChange(oEvent) {
            const sKey = oEvent.getParameter("selectedItem").getKey();
            const oSelect = oEvent.getSource();
            
            const oTable = this._getTableFromToolbarControl(oSelect);
            if (!oTable || !oTable.getBinding) return;
            
            const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
            if (!oBinding) return;
            
            // Parse key: "fieldName-direction"
            const [sPath, sDirection] = sKey.split("-");
            const bDescending = sDirection === "desc";
            
            // Create sorter
            const oSorter = new Sorter(sPath, bDescending);
            oBinding.sort(oSorter);
        },

        /* ========================================
         * FILTER HELPERS
         * ======================================== */

        /**
         * Apply all active filters to a table binding.
         * Combines: base type filter + TM sub-filter (SegmentedButton) + user filters (status/technician).
         * @param {sap.m.Table} oTable - Target table
         * @param {string} sTableType - "TM", "Expense", or "Mileage"
         * @private
         */
        _applyTableFilters(oTable, sTableType) {
            const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
            if (!oBinding) return;
            
            const aFilters = [];
            
            // For TM table, the SegmentedButton sub-filter takes priority over base type filters.
            // When a specific sub-type (Time Effort / Material) is selected, use that EQ filter alone —
            // this matches original behaviour and avoids conflicting AND combinations in UI5 JSONModel.
            // Base type filters (NE Expense, NE Mileage) are only needed for the "ALL" case.
            if (sTableType === "TM") {
                const sSubFilter = oTable.data("typeSubFilter") || "ALL";
                const aSubFilters = this._getTypeSubFilters(sSubFilter);
                if (aSubFilters.length > 0) {
                    // Specific sub-type selected — use EQ filter only, skip base type filters
                    aFilters.push(...aSubFilters);
                } else {
                    // ALL — use base type filters to exclude Expense and Mileage
                    aFilters.push(...this._getBaseTypeFilters(sTableType));
                }
            } else {
                // Expense / Mileage tables always use their base type filter
                aFilters.push(...this._getBaseTypeFilters(sTableType));
            }
            
            // User filters from ViewSettingsDialog (status & technician) — always AND'd on top
            const oActiveFilters = oTable.data("activeFilters") || {};
            aFilters.push(...this._buildUserFilters(oActiveFilters));
            
            oBinding.filter(aFilters);
        },

        /**
         * Base filters that lock each table to its own data type.
         * @param {string} sTableType - "TM", "Expense", or "Mileage"
         * @returns {sap.ui.model.Filter[]}
         * @private
         */
        _getBaseTypeFilters(sTableType) {
            if (sTableType === "Expense") {
                return [new Filter("type", FilterOperator.EQ, "Expense")];
            }
            if (sTableType === "Mileage") {
                return [new Filter("type", FilterOperator.EQ, "Mileage")];
            }
            // TM: exclude Expense and Mileage rows
            return [
                new Filter("type", FilterOperator.NE, "Expense"),
                new Filter("type", FilterOperator.NE, "Mileage")
            ];
        },

        /**
         * Sub-type filters from the SegmentedButton (TM table only).
         * @param {string} sKey - "ALL", "Time Effort", or "Material"
         * @returns {sap.ui.model.Filter[]}
         * @private
         */
        _getTypeSubFilters(sKey) {
            if (sKey === "Time Effort") return [new Filter("type", FilterOperator.EQ, "Time Effort")];
            if (sKey === "Material")    return [new Filter("type", FilterOperator.EQ, "Material")];
            return []; // ALL — no extra filter needed
        },

        /**
         * Build Filter objects from the stored user filter state.
         * Within each group (status / technician) filters are OR'd.
         * Between groups they are AND'd.
         * @param {{ statusKeys: string[], technicianKeys: string[] }} oActiveFilters
         * @returns {sap.ui.model.Filter[]}
         * @private
         */
        _buildUserFilters(oActiveFilters) {
            const aResult = [];
            
            const aStatusKeys     = oActiveFilters.statusKeys     || [];
            const aTechnicianKeys = oActiveFilters.technicianKeys || [];
            
            if (aStatusKeys.length > 0) {
                const aStatusFilters = aStatusKeys.map(sKey =>
                    new Filter("decisionStatus", FilterOperator.EQ, sKey)
                );
                // OR within status group
                aResult.push(aStatusFilters.length === 1
                    ? aStatusFilters[0]
                    : new Filter({ filters: aStatusFilters, and: false })
                );
            }
            
            if (aTechnicianKeys.length > 0) {
                const aTechFilters = aTechnicianKeys.map(sName =>
                    new Filter("createPersonDisplayText", FilterOperator.EQ, sName)
                );
                // OR within technician group
                aResult.push(aTechFilters.length === 1
                    ? aTechFilters[0]
                    : new Filter({ filters: aTechFilters, and: false })
                );
            }
            
            return aResult;
        },

        /**
         * Walk up the DOM to find the activity model path from a table's binding context.
         * Used to read all tmReports (unfiltered) for the technician list.
         * @param {sap.m.Table} oTable
         * @returns {string|null} e.g. "/productGroups/0/activities/1"
         * @private
         */
        _getActivityPathFromTable(oTable) {
            let oParent = oTable;
            while (oParent) {
                const oContext = oParent.getBindingContext?.("view");
                if (oContext) {
                    const sPath = oContext.getPath();
                    if (sPath && sPath.includes("/activities/")) {
                        return sPath;
                    }
                }
                oParent = oParent.getParent?.();
            }
            return null;
        },

        /* ========================================
         * EDIT SELECTED HANDLER
         * ======================================== */

        /**
         * Enable edit mode for selected T&M entries
         */
        onEditSelectedTM(oEvent) {
            const oButton = oEvent.getSource();
            
            const oTable = this._getTableFromToolbarControl(oButton);
            if (!oTable) return;
            
            const oModel = this.getView().getModel("view");
            const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
            if (!oBinding) return;
            
            // Get all contexts from binding and find selected ones
            const aContexts = oBinding.getContexts();
            let editCount = 0;
            
            aContexts.forEach(oContext => {
                const oData = oContext.getObject();
                if (oData.selected) {
                    const sPath = oContext.getPath();
                    
                    // Store original values for cancel functionality
                    oModel.setProperty(sPath + "/originalValues", {
                        duration: oData.duration,
                        durationMinutes: oData.durationMinutes,
                        durationHrs: oData.durationHrs,
                        travelDuration: oData.travelDuration,
                        travelDurationMinutes: oData.travelDurationMinutes,
                        distance: oData.distance,
                        distanceValue: oData.distanceValue,
                        quantity: oData.quantity,
                        remarks: oData.remarks,
                        remarksText: oData.remarksText,
                        externalAmountValue: oData.externalAmountValue,
                        internalAmountValue: oData.internalAmountValue,
                        entryDateFormatted: oData.entryDateFormatted
                    });
                    
                    oModel.setProperty(sPath + "/editMode", true);
                    oModel.setProperty(sPath + "/selected", false);
                    editCount++;
                }
            });
            
            if (editCount === 0) {
                MessageToast.show(this._getText("msgSelectEntriesToEdit"));
                return;
            }
            
            // Set activity-level edit mode flag based on table type
            const sActivityPath = this._getActivityPathFromToolbarControl(oButton);
            const sEditModeProp = this._getEditModeProperty(oTable);
            if (sActivityPath) {
                oModel.setProperty(sActivityPath + "/" + sEditModeProp, true);
            }
            
            MessageToast.show(this._getText("msgEntriesInEditMode", [editCount]));
        },

        /* ========================================
         * END EDIT HANDLER
         * ======================================== */

        /**
         * End edit mode for all entries (cancel)
         */
        onEndEditTM(oEvent) {
            const oButton = oEvent.getSource();
            
            const oTable = this._getTableFromToolbarControl(oButton);
            if (!oTable) return;
            
            const oModel = this.getView().getModel("view");
            const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
            if (!oBinding) return;
            
            const aContexts = oBinding.getContexts();
            let cancelCount = 0;
            
            aContexts.forEach(oContext => {
                const oData = oContext.getObject();
                if (oData.editMode) {
                    const sPath = oContext.getPath();
                    
                    // Restore original values
                    const originalValues = oData.originalValues;
                    if (originalValues) {
                        oModel.setProperty(sPath + "/duration", originalValues.duration);
                        oModel.setProperty(sPath + "/durationMinutes", originalValues.durationMinutes);
                        oModel.setProperty(sPath + "/durationHrs", originalValues.durationHrs);
                        oModel.setProperty(sPath + "/travelDuration", originalValues.travelDuration);
                        oModel.setProperty(sPath + "/travelDurationMinutes", originalValues.travelDurationMinutes);
                        oModel.setProperty(sPath + "/distance", originalValues.distance);
                        oModel.setProperty(sPath + "/distanceValue", originalValues.distanceValue);
                        oModel.setProperty(sPath + "/quantity", originalValues.quantity);
                        oModel.setProperty(sPath + "/remarks", originalValues.remarks);
                        oModel.setProperty(sPath + "/remarksText", originalValues.remarksText);
                        oModel.setProperty(sPath + "/externalAmountValue", originalValues.externalAmountValue);
                        oModel.setProperty(sPath + "/internalAmountValue", originalValues.internalAmountValue);
                        oModel.setProperty(sPath + "/entryDateFormatted", originalValues.entryDateFormatted);
                    }
                    
                    oModel.setProperty(sPath + "/editMode", false);
                    cancelCount++;
                }
            });
            
            // Clear activity-level edit mode based on table type
            const sActivityPath = this._getActivityPathFromToolbarControl(oButton);
            const sEditModeProp = this._getEditModeProperty(oTable);
            if (sActivityPath) {
                oModel.setProperty(sActivityPath + "/" + sEditModeProp, false);
            }
            
            if (cancelCount > 0) {
                MessageToast.show(this._getText("msgEditsCancelled", [cancelCount]));
            }
        },

        /* ========================================
         * SAVE ALL T&M HANDLER
         * ======================================== */

        /**
         * Save all edited T&M entries
         */
        onSaveAllTM(oEvent) {
            const oButton = oEvent.getSource();
            
            const oTable = this._getTableFromToolbarControl(oButton);
            if (!oTable) return;
            
            const oModel = this.getView().getModel("view");
            const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
            if (!oBinding) return;
            
            const aContexts = oBinding.getContexts();
            const aEditedReports = [];
            
            aContexts.forEach(oContext => {
                const oData = oContext.getObject();
                if (oData.editMode) {
                    aEditedReports.push({
                        ...oData,
                        _path: oContext.getPath()
                    });
                }
            });
            
            if (aEditedReports.length === 0) {
                MessageToast.show(this._getText("msgNoEntriesInEditMode"));
                return;
            }
            
            // Validate no future dates before showing confirmation
            const aMapped = aEditedReports.map(r => ({
                entryDate: r.entryDateFormatted,
                type: r.type,
                _desc: r.taskDisplayText || r.itemDisplayText || r.expenseTypeDisplayText || r.mileageTypeDisplayText || ""
            }));
            if (this._validateNoFutureDates(aMapped, (entry, index) => {
                return `${this._getText("msgEntryNumber")} ${index + 1} (${entry.type}${entry._desc ? " - " + entry._desc : ""})`;
            })) return;
            
            // Get activity path and edit mode property for later
            const sActivityPath = this._getActivityPathFromToolbarControl(oButton);
            const sEditModeProp = this._getEditModeProperty(oTable);
            
            // Build preview with user-friendly descriptions
            const lines = [];
            aEditedReports.forEach((report, i) => {
                let description = '';
                switch (report.type) {
                    case 'Time Effort':
                        description = report.taskDisplayText || report.taskCode || 'Time Entry';
                        break;
                    case 'Material':
                        description = report.itemDisplayText || 'Material';
                        break;
                    case 'Expense':
                    case 'Expense Report':
                        description = report.expenseTypeDisplayText || 'Expense';
                        break;
                    case 'Mileage':
                        description = report.mileageTypeDisplayText || report.itemDisplayText || 'Mileage';
                        break;
                    default:
                        description = report.type;
                }
                lines.push(`${i + 1}. ${report.type}: ${description}`);
            });
            
            MessageBox.confirm(
                this._getText("msgConfirmSaveEntries", [aEditedReports.length, lines.join('\n')]),
                {
                    title: this._getText("msgConfirmSaveEntriesTitle"),
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._executeSaveAllTM(oModel, aEditedReports, sActivityPath, sEditModeProp);
                        }
                    }
                }
            );
        },

        /**
         * Execute save all T&M entries
         * @private
         */
        async _executeSaveAllTM(oModel, aEditedReports, sActivityPath, sEditModeProp) {
            try {
                sap.ui.core.BusyIndicator.show(0);
                
                // Build batch entries array
                const batchEntries = [];
                
                for (const report of aEditedReports) {
                    let type, payload;

                    // Normalize entryDateFormatted — handles dd.MM.yyyy from manual typing
                    const normalizeDate = (s) => {
                        if (!s) return s;
                        if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) { const p = s.split('.'); return `${p[2]}-${p[1]}-${p[0]}`; }
                        if (/^\d{2}\.\d{2}\.\d{2}$/.test(s))  { const p = s.split('.'); return `20${p[2]}-${p[1]}-${p[0]}`; }
                        return s;
                    };
                    const entryDate = normalizeDate(report.entryDateFormatted);

                    switch (report.type) {
                        case "Time Effort":
                            type = 'TimeEffort';
                            // durationHrs is what the StepInput binds/edits — it is the source of truth.
                            // (report.durationMinutes is the stale original and must NOT take precedence.)
                            const durationMinutes = Math.round((report.durationHrs || 0) * 60);
                            // [VERIFY] Confirm StepInput's edited value propagated to the model row.
                            // If durationHrs here != the value typed in the StepInput, aEditedReports is
                            // reading a detached node and two-way binding is not writing back.
                            console.log("[SaveAll/TimeEffort] id=%s durationHrs=%s -> durationMinutes=%s (stale durationMinutes=%s)",
                                report.id, report.durationHrs, durationMinutes, report.durationMinutes);
                            payload = { ...report.fullData, remarks: report.remarksText || report.remarks };
                            if (payload.startDateTime) {
                                const startDate = new Date(payload.startDateTime);
                                const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
                                payload.endDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
                            }
                            if (entryDate && payload.startDateTime) {
                                const originalTime = payload.startDateTime.split('T')[1];
                                payload.startDateTime = `${entryDate}T${originalTime}`;
                                const startDate = new Date(payload.startDateTime);
                                const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
                                payload.endDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
                            }
                            console.log("[SaveAll/TimeEffort] id=%s startDateTime=%s endDateTime=%s",
                                report.id, payload.startDateTime, payload.endDateTime);
                            break;
                            
                        case "Material":
                            type = 'Material';
                            payload = { ...report.fullData, quantity: parseFloat(report.quantity) || 0, remarks: report.remarksText || report.remarks };
                            if (entryDate) {
                                payload.date = entryDate;
                            }
                            break;
                            
                        case "Expense":
                        case "Expense Report":
                            type = 'Expense';
                            payload = {
                                ...report.fullData,
                                externalAmount: { amount: parseFloat(report.externalAmountValue) || 0, currency: report.currency || 'EUR' },
                                internalAmount: { amount: parseFloat(report.internalAmountValue) || 0, currency: report.currency || 'EUR' },
                                remarks: report.remarksText || report.remarks
                            };
                            break;
                            
                        case "Mileage":
                            type = 'Mileage';
                            payload = { ...report.fullData, distance: parseFloat(report.distanceValue) || 0, remarks: report.remarksText || report.remarks };
                            if (payload.travelStartDateTime) {
                                const startDate = new Date(payload.travelStartDateTime);
                                const endDate = new Date(startDate.getTime() + (parseFloat(report.travelDurationMinutes) || 0) * 60 * 1000);
                                payload.travelEndDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
                            }
                            break;
                            
                        default:
                            console.warn(`Unknown type: ${report.type}`);
                            continue;
                    }
                    
                    batchEntries.push({
                        type,
                        id: report.id,
                        payload,
                        _path: report._path // Keep path for UI update
                    });
                }
                
                if (batchEntries.length === 0) {
                    MessageToast.show(this._getText("msgNoEntriesToUpdate"));
                    return;
                }
                
                // Chunk the batch so no single request exceeds body-size limits.
                // Sent sequentially; a failed chunk does NOT abort the rest.
                const CHUNK_SIZE = 50;
                let totalSuccess = 0;
                let totalError = 0;
                const failedEntries = [];   // { globalIndex, type, reason }
                const aSavedEntries = [];    // entries that saved OK (for badge refresh below)

                for (let chunkStart = 0; chunkStart < batchEntries.length; chunkStart += CHUNK_SIZE) {
                    const chunk = batchEntries.slice(chunkStart, chunkStart + CHUNK_SIZE);

                    let result;
                    try {
                        const response = await fetch('/api/v1/batch-update', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                entries: chunk.map(e => ({ type: e.type, id: e.id, payload: e.payload })),
                                transactional: false
                            })
                        });

                        // Guard: server/proxy may return non-JSON (e.g. HTML 413/502).
                        const contentType = response.headers.get("content-type") || "";
                        const isJson = contentType.indexOf("application/json") !== -1;

                        if (!response.ok || !isJson) {
                            const reason = response.status === 413
                                ? this._getText("msgBatchTooLarge")
                                : (response.status + " " + response.statusText);
                            for (let i = 0; i < chunk.length; i++) {
                                totalError++;
                                failedEntries.push({ globalIndex: chunkStart + i, type: chunk[i].type, reason });
                            }
                            console.error("Batch-update chunk failed:", response.status, response.statusText, "isJson:", isJson);
                            continue;
                        }

                        result = await response.json();
                    } catch (chunkError) {
                        console.error("Batch-update chunk error:", chunkError);
                        for (let i = 0; i < chunk.length; i++) {
                            totalError++;
                            failedEntries.push({ globalIndex: chunkStart + i, type: chunk[i].type, reason: chunkError.message });
                        }
                        continue;
                    }

                    totalSuccess += result.successCount || 0;
                    totalError += result.errorCount || 0;

                    // Map results back to the correct entry via contentId (reqN, 1-based,
                    // restarts per chunk). results[] order is NOT guaranteed — never use
                    // array position. Clear editMode only on rows that actually saved,
                    // and collect them for the badge/status refresh below.
                    if (Array.isArray(result.results)) {
                        result.results.forEach(res => {
                            let localIndex = -1;
                            if (res.contentId) {
                                const m = String(res.contentId).match(/(\d+)/);
                                if (m) localIndex = parseInt(m[1], 10) - 1;
                            }
                            const entry = localIndex >= 0 ? chunk[localIndex] : null;
                            if (!entry) return;
                            if (res.success) {
                                oModel.setProperty(entry._path + "/editMode", false);
                                aSavedEntries.push(entry);
                            } else {
                                const reason = this._extractBatchErrorReason(res);
                                failedEntries.push({ globalIndex: chunkStart + localIndex, type: entry.type, reason });
                            }
                        });
                    }
                }

                // Editing an entry resets its approval decision server-side (e.g. CHANGE -> PENDING).
                // The batch-update response does NOT carry the new decisionStatus, so re-fetch it for
                // each saved entry and apply it to the model in place — this updates the badge/lock
                // state immediately, without forcing the user to press the manual Refresh button.
                await Promise.all(aSavedEntries.map(async (entry) => {
                    try {
                        const sNewStatus = await ApprovalService.refreshStatusForEntry(entry.id);
                        const sEffectiveStatus = sNewStatus || 'PENDING';
                        oModel.setProperty(entry._path + "/decisionStatus", sEffectiveStatus);
                        oModel.setProperty(entry._path + "/decisionStatusState", ApprovalService.getStatusState(sEffectiveStatus));
                        oModel.setProperty(entry._path + "/decisionRemarks", ApprovalService.getRemarksById(entry.id) || '');
                        oModel.setProperty(entry._path + "/selected", false);
                    } catch (e) {
                        console.error("Post-save status refresh failed for", entry.id, e);
                    }
                }));

                if (totalError === 0) {
                    MessageToast.show(this._getText("msgEntriesSaved", [totalSuccess]));
                    // Clear activity-level edit mode based on table type
                    if (sActivityPath && sEditModeProp) {
                        oModel.setProperty(sActivityPath + "/" + sEditModeProp, false);
                    }
                } else {
                    const MAX_LISTED = 15;
                    const lines = failedEntries.slice(0, MAX_LISTED).map(f =>
                        `#${f.globalIndex + 1} (${f.type}): ${f.reason}`
                    );
                    if (failedEntries.length > MAX_LISTED) {
                        lines.push(this._getText("msgAndMoreFailures", [failedEntries.length - MAX_LISTED]));
                    }
                    const detail = lines.join('\n');

                    if (totalSuccess > 0) {
                        MessageBox.warning(this._getText("msgPartialSaveSuccess", [totalSuccess, totalError]) + "\n\n" + detail);
                    } else {
                        MessageBox.error(this._getText("msgBatchUpdateFailed") + "\n\n" + detail);
                    }
                }
                
            } catch (error) {
                console.error("Error in save all:", error);
                MessageBox.error(this._getText("msgError", [error.message]));
            } finally {
                sap.ui.core.BusyIndicator.hide();
            }
        },

        /* =========================================================================
         * DELETE SELECTED ENTRIES
         * ========================================================================= */

        /**
         * Delete selected T&M entries.
         * Entries with PENDING or CHANGE (DECLINED) status can be deleted. REVIEW, DECLINED_CLOSED,
         * and APPROVED entries cannot be selected (no checkbox renders for them).
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
                        // Include selected entries with PENDING or CHANGE (DECLINED) status.
                        // REVIEW/DECLINED_CLOSED/APPROVED entries don't render a checkbox (see view binding),
                        // so they can't appear here even if the data model briefly says report.selected.
                        if (report.selected && (report.decisionStatus === 'PENDING' || report.decisionStatus === 'DECLINED')) {
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
                
                // Guarded fetch helper: returns parsed JSON, or throws a clear error
                // if the server/proxy returned non-JSON (e.g. HTML 413/502).
                const postBatchDelete = async (payloadEntries) => {
                    const response = await fetch('/api/v1/batch-delete', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ entries: payloadEntries, transactional: false })
                    });
                    const contentType = response.headers.get("content-type") || "";
                    const isJson = contentType.indexOf("application/json") !== -1;
                    if (!response.ok || !isJson) {
                        const reason = response.status === 413
                            ? this._getText("msgBatchTooLarge")
                            : (response.status + " " + response.statusText);
                        const err = new Error(reason);
                        err.isTransport = true;
                        throw err;
                    }
                    return response.json();
                };

                // Chunk the initial delete so large selections stay under body limits.
                // Aggregate results across chunks; a failed chunk does not abort the rest.
                const DELETE_CHUNK_SIZE = 100;
                let aggregatedResults = [];
                let totalSuccess = 0;
                let totalError = 0;

                for (let ci = 0; ci < entries.length; ci += DELETE_CHUNK_SIZE) {
                    const chunk = entries.slice(ci, ci + DELETE_CHUNK_SIZE);
                    try {
                        const chunkResult = await postBatchDelete(chunk);
                        totalSuccess += chunkResult.successCount || 0;
                        totalError += chunkResult.errorCount || 0;
                        if (Array.isArray(chunkResult.results)) {
                            aggregatedResults = aggregatedResults.concat(chunkResult.results);
                        }

                        // Handle CA-27 (concurrent modification) within this chunk by
                        // retrying with updated lastChanged. Keyed on entry id, not position.
                        const ca27Errors = (chunkResult.results || []).filter(r => !r.success && r.data?.error === 'CA-27');
                        if (ca27Errors.length > 0) {
                            console.log("CA-27 detected, retrying with updated lastChanged values");
                            ca27Errors.forEach(err => {
                                const entryIndex = chunk.findIndex(e => e.id === err.data?.values?.[2]);
                                if (entryIndex >= 0 && err.data?.values?.[0]) {
                                    chunk[entryIndex].lastChanged = err.data.values[0];
                                }
                            });
                            const retryEntries = ca27Errors
                                .map(err => chunk.find(e => e.id === err.data?.values?.[2]))
                                .filter(Boolean);
                            if (retryEntries.length > 0) {
                                try {
                                    const retryResult = await postBatchDelete(retryEntries);
                                    totalSuccess += retryResult.successCount || 0;
                                    totalError -= (retryResult.successCount || 0); // previously counted as errors
                                } catch (retryErr) {
                                    console.error("CA-27 retry failed:", retryErr);
                                }
                            }
                        }
                    } catch (chunkErr) {
                        console.error("Batch-delete chunk failed:", chunkErr);
                        totalError += chunk.length;
                    }
                }

                const result = {
                    success: totalError === 0 && totalSuccess > 0,
                    successCount: totalSuccess,
                    errorCount: totalError,
                    results: aggregatedResults
                };

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
                let groupTotal = 0;
                
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
                    
                    groupTotal += aReports.length;
                });
                
                // Update product group total
                oModel.setProperty(`/productGroups/${groupIndex}/tmTotalCount`, groupTotal);
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