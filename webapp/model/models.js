/**
 * models.js
 * 
 * Model factory for the UI5 application.
 * Provides the device model used for responsive layout decisions.
 * 
 * @file models.js
 * @module com/tng/fsm/timematerialext/app/model/models
 */
sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device"
], 
function (JSONModel, Device) {
    "use strict";

    return {
        /**
         * Provides runtime information for the device the UI5 app is running on as a JSONModel.
         * @returns {sap.ui.model.json.JSONModel} The device model.
         */
        createDeviceModel: function () {
            var oModel = new JSONModel(Device);
            oModel.setDefaultBindingMode("OneWay");
            return oModel;
        }
    };

});