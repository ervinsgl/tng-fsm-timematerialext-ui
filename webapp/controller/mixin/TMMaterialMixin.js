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
 * Quantity Input (create dialog + inline edit table):
 * - Decimal quantities with up to 2 decimals (e.g. 0.25, 1.75, 2.5, 1.63)
 * - Comma AND dot are both accepted as decimal separator while typing, so
 *   German (1,75) and English/international (1.75) input work the same way
 * - Display follows the UI5 locale (de: "1,75", en: "1.75") via
 *   formatter.formatQuantityInput
 * - +/- steppers still step by exactly 1 and keep the decimals (1,75 -> 2,75)
 * - The model always holds a plain JS number (never a localized string)
 *
 * @file TMMaterialMixin.js
 * @module com/tns/fsm/timematerialext/app/controller/mixin/TMMaterialMixin
 */
sap.ui.define([
    "sap/m/MessageToast",
    "com/tns/fsm/timematerialext/app/model/formatter"
], (MessageToast, formatter) => {
    "use strict";

    /** Maximum number of decimals allowed for a material quantity. */
    const QTY_MAX_DECIMALS = 2;

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

        /* ========================================
         * QUANTITY STEPPER (custom +/- control) — create dialog
         * ======================================== */

        /**
         * Increase a material entry's quantity by one whole unit.
         * Adjusts the plain model number directly (no text parsing), so it is
         * locale-safe. Decimals are kept: 1.75 -> 2.75.
         * @param {sap.ui.base.Event} oEvent press event from the + button
         */
        onQuantityStepUp(oEvent) {
            this._stepQuantity(oEvent, 1);
        },

        /**
         * Decrease a material entry's quantity by one whole unit, clamped at 0.
         * Decimals are kept: 2.5 -> 1.5; 0.5 -> 0.
         * @param {sap.ui.base.Event} oEvent press event from the - button
         */
        onQuantityStepDown(oEvent) {
            this._stepQuantity(oEvent, -1);
        },

        /**
         * Shared quantity stepper: adjust the pressed row's quantity by iDelta,
         * clamped to >= 0 and rounded to 2 decimals, then re-validate.
         * @param {sap.ui.base.Event} oEvent the button press event
         * @param {number} iDelta step delta (e.g. +1 or -1)
         * @private
         */
        _stepQuantity(oEvent, iDelta) {
            const oContext = oEvent.getSource().getBindingContext("createTM");
            if (!oContext) return;
            const oModel = oContext.getModel();
            const sPath = oContext.getPath();

            const fCurrent = parseFloat(oModel.getProperty(sPath + "/quantity")) || 0;
            let fNext = this._roundQuantity(fCurrent + iDelta);
            if (fNext < 0) fNext = 0;

            oModel.setProperty(sPath + "/quantity", fNext);
            this._updateMaterialQuantityStates(oModel);
        },

        /* ========================================
         * QUANTITY TEXT INPUT — create dialog ("createTM" model)
         * ======================================== */

        /**
         * While typing: allow digits and ONE decimal separator (',' or '.'),
         * at most 2 decimals. The parsed number is written to the model right
         * away so the "of X pcs" remaining text and the warning state update
         * live, but the user's own text is kept in the field (so "1," or "0,0"
         * mid-typing is not reformatted away).
         * @param {sap.ui.base.Event} oEvent liveChange event from the quantity input
         */
        onQuantityInputLiveChange(oEvent) {
            const oInput = oEvent.getSource();
            const oContext = oInput.getBindingContext("createTM");
            const sClean = this._sanitizeQuantityText(oEvent.getParameter("value"));

            if (oContext) {
                const oModel = oContext.getModel();
                oModel.setProperty(oContext.getPath() + "/quantity", this._parseQuantityText(sClean));
                this._updateMaterialQuantityStates(oModel);
            }
            // Keep exactly what the user typed (sanitized). The model write above
            // may have re-rendered the field via the formatter.
            if (oInput.getValue() !== sClean) {
                oInput.setValue(sClean);
            }
        },

        /**
         * On commit (blur/enter): parse, write to the model and show the value
         * in the user's locale format (e.g. "1.5" typed under de -> "1,5").
         * @param {sap.ui.base.Event} oEvent change event from the quantity input
         */
        onQuantityInputChange(oEvent) {
            const oInput = oEvent.getSource();
            const oContext = oInput.getBindingContext("createTM");
            const fVal = this._parseQuantityText(this._sanitizeQuantityText(oEvent.getParameter("value")));

            if (oContext) {
                const oModel = oContext.getModel();
                oModel.setProperty(oContext.getPath() + "/quantity", fVal);
                this._updateMaterialQuantityStates(oModel);
            }
            // Model value may be unchanged (e.g. "1,5" -> "1,50"), in which case
            // the binding does not re-render — set the formatted text explicitly.
            oInput.setValue(formatter.formatQuantityInput(fVal));
        },

        /* ========================================
         * QUANTITY TEXT INPUT — inline edit table ("view" model)
         * Same rules as the create dialog. No steppers in the edit table.
         * ======================================== */

        /**
         * While typing in the edit table: sanitize, write the parsed number to
         * the row's model (so Save All always sees the typed value, even without
         * a blur), and keep the user's text in the field.
         * @param {sap.ui.base.Event} oEvent liveChange event from the edit quantity input
         */
        onEditQuantityLiveChange(oEvent) {
            const oInput = oEvent.getSource();
            const oContext = oInput.getBindingContext("view");
            const sClean = this._sanitizeQuantityText(oEvent.getParameter("value"));

            if (oContext) {
                oContext.getModel().setProperty(oContext.getPath() + "/quantity", this._parseQuantityText(sClean));
            }
            if (oInput.getValue() !== sClean) {
                oInput.setValue(sClean);
            }
        },

        /**
         * On commit in the edit table: parse, write to the model and show the
         * value in the user's locale format.
         * @param {sap.ui.base.Event} oEvent change event from the edit quantity input
         */
        onEditQuantityChange(oEvent) {
            const oInput = oEvent.getSource();
            const oContext = oInput.getBindingContext("view");
            const fVal = this._parseQuantityText(this._sanitizeQuantityText(oEvent.getParameter("value")));

            if (oContext) {
                oContext.getModel().setProperty(oContext.getPath() + "/quantity", fVal);
            }
            oInput.setValue(formatter.formatQuantityInput(fVal));
        },

        /* ========================================
         * QUANTITY PARSING HELPERS (locale-neutral)
         * ======================================== */

        /**
         * Strip everything except digits and the first decimal separator
         * (',' or '.'), and cut the fraction to QTY_MAX_DECIMALS digits.
         * Both separators are treated as DECIMAL separators (no thousands
         * grouping), so "1,75" and "1.75" are identical.
         *   "1,756" -> "1,75"   "1.5.3" -> "1.53"   "abc2" -> "2"   ",5" -> ",5"
         * @param {string} sValue raw text from the input
         * @returns {string} sanitized text, safe to show in the field
         * @private
         */
        _sanitizeQuantityText(sValue) {
            let sClean = String(sValue || "").replace(/[^0-9.,]/g, "");
            const iSep = sClean.search(/[.,]/);
            if (iSep !== -1) {
                const sHead = sClean.slice(0, iSep + 1);
                const sTail = sClean.slice(iSep + 1).replace(/[.,]/g, "").slice(0, QTY_MAX_DECIMALS);
                sClean = sHead + sTail;
            }
            return sClean;
        },

        /**
         * Parse sanitized quantity text into a number rounded to 2 decimals.
         * Empty / invalid text -> 0. Negative values cannot occur (no '-' allowed).
         * @param {string} sClean output of _sanitizeQuantityText
         * @returns {number} quantity, e.g. 1.75
         * @private
         */
        _parseQuantityText(sClean) {
            const fVal = parseFloat(String(sClean || "").replace(",", "."));
            if (isNaN(fVal) || fVal < 0) return 0;
            return this._roundQuantity(fVal);
        },

        /**
         * Round to QTY_MAX_DECIMALS decimals, avoiding binary float artefacts
         * (e.g. 0.1 + 0.2, 1.005).
         * @param {number} fVal value to round
         * @returns {number} rounded value
         * @private
         */
        _roundQuantity(fVal) {
            const iFactor = Math.pow(10, QTY_MAX_DECIMALS);
            return Math.round((fVal + Number.EPSILON) * iFactor) / iFactor;
        },

        /**
         * Update quantity states and remaining quantity for all material entries
         * @private
         */
        _updateMaterialQuantityStates(oModel) {
            const plannedQty = parseFloat(oModel.getProperty("/plannedMaterialQty")) || 0;
            const reportedQty = parseFloat(oModel.getProperty("/reportedMaterialQty")) || 0;
            const aMaterialEntries = oModel.getProperty("/materialEntries") || [];

            // Calculate total quantity being created (rounded: decimals are summed)
            let totalCreatingQty = 0;
            aMaterialEntries.forEach(entry => {
                totalCreatingQty += parseFloat(entry.quantity) || 0;
            });
            totalCreatingQty = this._roundQuantity(totalCreatingQty);

            // Calculate remaining after all current entries
            const availableQty = this._roundQuantity(plannedQty - reportedQty);
            const remainingAfterCreation = Math.max(0, this._roundQuantity(availableQty - totalCreatingQty));
            oModel.setProperty("/remainingMaterialQty", remainingAfterCreation);

            // Update each entry's state
            // Show warning if total exceeds available
            aMaterialEntries.forEach((entry, index) => {
                const state = totalCreatingQty > availableQty ? "Warning" : "None";
                oModel.setProperty(`/materialEntries/${index}/quantityState`, state);
            });
        }

    };
});