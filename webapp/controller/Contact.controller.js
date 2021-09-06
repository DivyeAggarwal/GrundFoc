sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/Sorter",
	"sap/ui/model/FilterOperator",
	"sap/m/GroupHeaderListItem",
	"sap/ui/Device",
	"sap/ui/core/Fragment",
    "../model/formatter",
    "sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, Filter, Sorter, FilterOperator, GroupHeaderListItem, Device, Fragment, formatter, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("servicerequests.controller.Contact", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the master list controller is instantiated. It sets up the event handling for the master/detail communication and other lifecycle tasks.
		 * @public
		 */
		onInit : function () {
            var oModel = this.getOwnerComponent().getModel("custom");
            this.getView().setModel(oModel);
        },
        onAddRelatedDeal: function () {
			this.getRouter().navTo("master");
        }

	});

});