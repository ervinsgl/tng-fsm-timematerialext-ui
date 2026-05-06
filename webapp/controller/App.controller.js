/**
 * App.controller.js
 * 
 * Root controller for the SAP UI5 application shell.
 * Provides the App view container; all application logic
 * is handled by View1.controller.js and its mixins.
 * 
 * @file App.controller.js
 * @module com/tng/fsm/timematerialext/app/controller/App
 * @extends sap.ui.core.mvc.Controller
 */
sap.ui.define([
  "sap/ui/core/mvc/Controller"
], (BaseController) => {
  "use strict";

  return BaseController.extend("com.tng.fsm.timematerialext.app.controller.App", {
      onInit() {
      }
  });
});