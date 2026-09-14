/**
 * TMUserSettingMixin.js
 *
 * Mixin containing the User Settings dialog.
 *
 * Shows the app's user settings, stored in FSM as the UDO 'TMExt_UserSettings':
 *   - one "available settings" table built from the UDO DEFINITION - every
 *     possible field, with a dropdown of its selection list
 *   - one table per stored record (UdoValue), read-only
 *
 * No setting name is hardcoded here. The backend (utils/FSMUdoService.js)
 * resolves every UDF meta UUID to a label, turns selectionKeyValues into
 * options and says which fields the client must fill itself, so a setting added
 * in FSM later needs no change in this file.
 *
 * The one value the browser owns is the logged-in user: a field marked
 * fillWith = 'PERSON_EXTERNAL_ID' is filled with the user's Person externalId,
 * resolved once at startup by DataLoadingMixin._loadOrganizationLevels().
 *
 * Model split (matters for the future PATCH):
 *   selectedValue - the value that will be STORED (externalId for a person field)
 *   displayValue  - what the table SHOWS ("firstName lastName" for a person)
 *
 * Fragment: view/fragments/UserSettingsDialog.fragment.xml
 * Model:    userSettings (local to the dialog)
 *
 * @file TMUserSettingMixin.js
 * @module com/tns/fsm/timematerialext/app/controller/mixin/TMUserSettingMixin
 */
sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "com/tns/fsm/timematerialext/app/utils/services/UserSettingsService"
], (JSONModel, Fragment, MessageToast, MessageBox, UserSettingsService) => {
    "use strict";

    return {

        /* =========================================================================
         * DIALOG HANDLERS
         * ========================================================================= */

        /**
         * Open the User Settings dialog and load its data.
         * The dialog is created once and reused; data comes from the service
         * cache unless a refresh is requested.
         */
        async onOpenUserSettings() {
            if (!this._userSettingsDialog) {
                this._userSettingsDialog = await Fragment.load({
                    name: "com.tns.fsm.timematerialext.app.view.fragments.UserSettingsDialog",
                    controller: this
                });
                this.getView().addDependent(this._userSettingsDialog);
                this._userSettingsDialog.setModel(new JSONModel({
                    busy: false,
                    hasError: false,
                    definitionDescription: "",
                    emptyDescription: "",
                    fieldCount: 0,
                    fields: [],
                    recordCount: 0
                }), "userSettings");
            }

            this._userSettingsDialog.open();
            await this._loadUserSettingsIntoModel(false);
        },

        /**
         * Close the User Settings dialog
         */
        onCloseUserSettings() {
            if (this._userSettingsDialog) {
                this._userSettingsDialog.close();
            }
        },

        /**
         * Re-read the settings from FSM, bypassing the service cache.
         */
        async onRefreshUserSettings() {
            await this._loadUserSettingsIntoModel(true);
        },

        /**
         * Write the current user's settings record from the "available
         * settings" table.
         *
         * Create or update is decided in the backend: it looks for a record
         * whose person UDF already holds this user's externalId. If there is
         * one it is updated in place, otherwise a new record is created. The
         * toast names which of the two happened.
         *
         * Only filled-in settings are written - a field the user left empty is
         * skipped rather than stored as an empty string.
         */
        async onSaveUserSetting() {
            const model = this._userSettingsDialog?.getModel("userSettings");
            if (!model) return;

            // The person externalId is half of the record key, so without it
            // there is nothing to address.
            const personExternalIds = this._getCurrentPersonExternalIds();
            if (personExternalIds.length === 0) {
                MessageBox.error(this._getText("msgUserSettingNoPerson"));
                return;
            }

            const values = (model.getProperty("/fields") || [])
                .filter(field => field.externalId)
                .map(field => ({
                    externalId: field.externalId,
                    // selectedValue holds what gets STORED: the option code for a
                    // selection field, the externalId for a person field.
                    value: field.selectedValue
                }))
                .filter(entry => entry.value !== undefined && entry.value !== null && String(entry.value) !== "");

            if (values.length === 0) {
                MessageToast.show(this._getText("msgUserSettingNothingToSave"));
                return;
            }

            model.setProperty("/busy", true);

            try {
                // All identities go down: any one of them may key the record that
                // already exists, and sending only the primary would create a
                // second one. The backend still writes new records under [0].
                const result = await UserSettingsService.saveUserSetting(personExternalIds, values);

                MessageToast.show(this._getText(
                    result.created ? "msgUserSettingCreated" : "msgUserSettingUpdated"
                ));

                // Re-read so the record appears (or updates) in the tables below.
                await this._loadUserSettingsIntoModel(true);

            } catch (error) {
                console.error("TMUserSettingMixin: Failed to save user setting", error);
                MessageBox.error(this._getText("msgUserSettingSaveFailed", [error.message || ""]));

            } finally {
                model.setProperty("/busy", false);
            }
        },

        /* =========================================================================
         * MODEL LOADING
         * ========================================================================= */

        /**
         * Fetch the settings and map them into the dialog model.
         *
         * Adds only presentation state; labels, values and dropdown options
         * arrive from the backend already resolved:
         *   /fields      - definition fields, each with selectedValue (editable),
         *                  displayValue and savedDisplayValue (what is in force)
         *   /recordCount - 0 or 1; drives the header badge and the empty state
         *
         * @param {boolean} forceReload - bypass the UserSettingsService cache
         * @private
         */
        async _loadUserSettingsIntoModel(forceReload) {
            const model = this._userSettingsDialog?.getModel("userSettings");
            if (!model) return;

            model.setProperty("/busy", true);
            model.setProperty("/hasError", false);

            try {
                // The whole set is used to FIND the record; [0] - the primary
                // (anchor) identity - is what a person field displays and what a
                // new record would be keyed on.
                const personExternalIds = this._getCurrentPersonExternalIds();
                const personExternalId = personExternalIds[0] || "";
                const personDisplayName = this._getCurrentPersonDisplayName();

                // The backend narrows this to the logged-in user: zero records
                // when they have never saved, exactly one when they have.
                const data = await UserSettingsService.fetchUserSettings(forceReload, personExternalIds);
                const ownRecord = (data?.records || [])[0] || null;

                // What this user has ACTUALLY saved, keyed so each definition field
                // can find its own stored value. Keyed by UDF externalId first and
                // by meta UUID as well, because a record written before a field was
                // renamed in FSM still carries the old externalId but the same UUID.
                //
                // A person setting is STORED as an externalId ('egleizds1'), which is
                // not what a person wants to read, so it resolves to the name - but
                // only when the stored value is one of THIS user's identities. A
                // value belonging to someone else stays as stored rather than being
                // mislabelled with their name.
                const personFieldExternalId = (data?.definition?.fields || [])
                    .find(field => field.fillWith === "PERSON_EXTERNAL_ID")?.externalId || null;

                const savedByKey = new Map();
                (ownRecord?.settings || []).forEach(setting => {
                    const isOwnPersonValue = personFieldExternalId
                        && setting.externalId === personFieldExternalId
                        && personExternalIds.indexOf(setting.value) !== -1;

                    const shown = (isOwnPersonValue && personDisplayName)
                        ? personDisplayName
                        : (setting.displayValue || "");

                    if (setting.externalId) savedByKey.set(setting.externalId, shown);
                    if (setting.metaId) savedByKey.set(setting.metaId, shown);
                });

                // One table: every possible setting from the UDO definition, with the
                // editable value AND the value currently in force side by side.
                const fields = (data?.definition?.fields || []).map(field => {
                    // selectedValue is the STORED value - the externalId for a
                    // person field, the option code for a selection field.
                    // Two-way binding overwrites it as the user picks an option;
                    // onSaveUserSetting reads it back.
                    const selectedValue = this._resolveUserSettingValue(field, personExternalId, ownRecord);

                    return {
                        ...field,
                        selectedValue: selectedValue,
                        // displayValue is what the editable column shows. Same as
                        // selectedValue except for person fields, where the
                        // name reads better than the externalId.
                        displayValue: field.fillWith === "PERSON_EXTERNAL_ID"
                            ? (personDisplayName || selectedValue)
                            : selectedValue,
                        // The "applied" column: what is saved in FSM right now.
                        // "" when this user has saved nothing for this setting -
                        // the table renders that as an en dash.
                        savedDisplayValue: savedByKey.get(field.externalId)
                            || savedByKey.get(field.metaId)
                            || ""
                    };
                });

                model.setProperty("/definitionDescription", data?.definition?.description || "");
                model.setProperty("/fields", fields);
                model.setProperty("/fieldCount", fields.length);

                // No record list any more - only the count, which still drives the
                // "saved" badge in the header and the empty state below.
                model.setProperty("/recordCount", ownRecord ? 1 : 0);

                // Empty state names the user, so it is a model property rather
                // than a static i18n binding in the fragment.
                model.setProperty("/emptyDescription", this._getText(
                    "userSettingsEmptyDesc",
                    [personDisplayName || personExternalId || ""]
                ));

            } catch (error) {
                console.error("TMUserSettingMixin: Failed to load user settings", error);
                model.setProperty("/fields", []);
                model.setProperty("/fieldCount", 0);
                model.setProperty("/definitionDescription", "");
                model.setProperty("/recordCount", 0);
                model.setProperty("/hasError", true);

            } finally {
                model.setProperty("/busy", false);
            }
        },

        /* =========================================================================
         * CURRENT USER
         * ========================================================================= */

        /**
         * EVERY Person externalId of the logged-in user, primary first.
         *
         * Resolved once at startup by _loadOrganizationLevels():
         *   userName -> User API -> Person (or UnifiedPerson on the fallback
         *   path, for accounts where Person.userName holds the login name)
         * and stored on /webContainerContext/personExternalIds. Whichever of
         * the two paths answered is the one used here - no extra lookup.
         *
         * WHY A LIST
         *   FSM stores one Person row per type for the same human, each with its
         *   own externalId - 'egleizds1' (ERPUSER) and 'egleizds2' (EMPLOYEE).
         *   A settings record may sit under either. Reading or writing with only
         *   one of them can miss an existing record and create a duplicate, so
         *   every call that identifies the user carries the whole list.
         *
         *   The backend ranks them, so [0] is the anchor (ERPUSER) identity and
         *   is stable across calls - that is the one a new record is keyed on and
         *   the one shown in the dialog.
         *
         * @returns {string[]} externalIds, empty when the user could not be resolved
         * @private
         */
        _getCurrentPersonExternalIds() {
            const viewModel = this.getView().getModel("view");
            const externalIds = viewModel?.getProperty("/webContainerContext/personExternalIds") || [];
            return externalIds.map(entry => String(entry)).filter(Boolean);
        },

        /**
         * Display name of the logged-in user, "firstName lastName".
         *
         * Comes from the same Person / UnifiedPerson row as the externalId, so
         * the name shown always belongs to the identity whose externalId a
         * PATCH would write.
         *
         * @returns {string} display name, or '' when the user is unresolved
         * @private
         */
        _getCurrentPersonDisplayName() {
            const viewModel = this.getView().getModel("view");
            return viewModel?.getProperty("/webContainerContext/personDisplayName") || "";
        },

        /**
         * Value to pre-fill for one field of the available-settings table.
         *
         * Precedence, first match wins:
         *
         *   1. person field (fillWith === 'PERSON_EXTERNAL_ID')
         *          -> the logged-in user's Person externalId. It identifies the
         *             record, so it is never taken from anywhere else.
         *   2. what the user saved last time
         *          -> so a user who chose "Current date" sees "Current date"
         *             preselected, not the app default.
         *   3. defaultOptionKey
         *          -> UdfMeta.defaultValue, else the app default (DateType =
         *             "Dispo date"). This is what a first-time user gets.
         *
         * A setting added in FSM later needs no change here: it arrives with
         * fillWith = null and its own default, and renders from its metadata.
         *
         * @param {Object} field - field from the UDO definition
         * @param {string} personExternalId - current user's Person externalId
         * @param {Object|null} ownRecord - the user's saved record, when there is one
         * @returns {string}
         * @private
         */
        _resolveUserSettingValue(field, personExternalId, ownRecord) {
            if (field.fillWith === "PERSON_EXTERNAL_ID") {
                return personExternalId;
            }

            const saved = this._getSavedValue(field, ownRecord);
            if (saved !== "") {
                return saved;
            }

            return field.defaultOptionKey || "";
        },

        /**
         * The value this field holds in the user's saved record, as an option key.
         *
         * A selection value may be stored as its code ("1") or - in records
         * created by hand in FSM - as its display text ("Current date"). Either
         * is translated to the option key, because that is what the Select
         * binds and what a save must send.
         *
         * @param {Object} field - field from the UDO definition
         * @param {Object|null} ownRecord - the user's saved record
         * @returns {string} option key, or '' when the field was never saved
         * @private
         */
        _getSavedValue(field, ownRecord) {
            if (!ownRecord || !field.externalId) return "";

            const saved = (ownRecord.settings || [])
                .find(setting => setting.externalId === field.externalId);

            const value = saved?.value;
            if (value === undefined || value === null || String(value) === "") return "";

            const options = field.options || [];
            if (options.length === 0) {
                return String(value);
            }

            const match = options.find(option => option.key === value || option.text === value);
            return match ? match.key : String(value);
        }
    };
});