sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
    "../model/formatter",
    "sap/m/FeedListItem",
    "sap/m/ListType",
    "sap/m/library",
    "sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, formatter, FeedListItem, ListType, mobileLibrary, MessageBox, MessageToast) {
	"use strict";

	// shortcut for sap.m.URLHelper
	var URLHelper = mobileLibrary.URLHelper;

	return BaseController.extend("servicerequests.controller.Detail", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit : function () {
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			var oViewModel = new JSONModel({
				busy : false,
				delay : 0,
				lineItemListTitle : this.getResourceBundle().getText("detailLineItemTableHeading")
			});
            this.createNewTicket = false;
			var oView = this.getView();
			var _self = this;
			this.getRouter().getRoute("object").attachPatternMatched(this._onObjectMatched, this);

			this.setModel(oViewModel, "detailView");

            this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));

            this.app = this.getOwnerComponent().getAggregation("rootControl");
			this.app.setBusyIndicatorDelay(0);
            
            var incidentModel = new JSONModel({results: []});

            var oModel = this.getOwnerComponent().getModel();
				this.setModel(oModel, "ServiceRequest");
                this.setModel(incidentModel, "IncidentModel");
                
                var status = oModel.getData();
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * Event handler when the share by E-Mail button has been clicked
		 * @public
		 */
		onSendEmailPress : function () {
			var oViewModel = this.getModel("detailView");

			URLHelper.triggerEmail(
				null,
				oViewModel.getProperty("/shareSendEmailSubject"),
				oViewModel.getProperty("/shareSendEmailMessage")
			);
		},


		/**
		 * Updates the item count within the line item table's header
		 * @param {object} oEvent an event containing the total number of items in the list
		 * @private
		 */
		onListUpdateFinished : function (oEvent) {
			var sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView");

			// only update the counter if the length is final
			if (this.byId("lineItemsList").getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeadingCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeading");
				}
				oViewModel.setProperty("/lineItemListTitle", sTitle);
			}
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		/**
		 * Binds the view to the object path and expands the aggregated line items.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched : function (oEvent) {
			var sObjectId =  oEvent.getParameter("arguments").objectId;
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getModel().metadataLoaded().then( function() {
				var sObjectPath = this.getModel().createKey("ServiceRequestCollection", {
					ObjectID :  sObjectId
				});
				this._bindView("/" + sObjectPath);
            }.bind(this));
            
            var sObjectPath = this.getModel().createKey("ServiceRequestCollection", {
					ObjectID :  sObjectId
				});
            var status = this.getModel().oData[sObjectPath].ServiceRequestUserLifeCycleStatusCode;
            if (status === "5") {
                this.getView().byId("setToAcceptBtn").setVisible(true);
                this.getView().byId("setToRejectBtn").setVisible(true);
            } else {
                this.getView().byId("setToAcceptBtn").setVisible(false);
                this.getView().byId("setToRejectBtn").setVisible(false);
            }
		},

		/**
		 * Binds the view to the object path. Makes sure that detail view displays
		 * a busy indicator while data for the corresponding element binding is loaded.
		 * @function
		 * @param {string} sObjectPath path to the object to be bound to the view.
		 * @private
		 */
		_bindView : function (sObjectPath) {
			// Set busy indicator during view binding
			var oViewModel = this.getModel("detailView");

			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);

			this.getView().bindElement({
                path : sObjectPath,
                parameters: {
					expand: "ServiceRequestTextCollection,ServiceRequestAttachmentFolder"
				},
				events: {
					change : this._onBindingChange.bind(this),
					dataRequested : function () {
						oViewModel.setProperty("/busy", true);
					},
					dataReceived: function () {
                        oViewModel.setProperty("/busy", false);
                        this._populateDescriptionsList(sObjectPath);
                        this._populateAttachmentsList(sObjectPath);
					}
				}
			});
		},

		_onBindingChange : function () {
			var oView = this.getView(),
				oElementBinding = oView.getElementBinding();

			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("detailObjectNotFound");
				// if object could not be found, the selection in the master list
				// does not make sense anymore.
				this.getOwnerComponent().oListSelector.clearMasterListSelection();
				return;
			}

			var sPath = oElementBinding.getPath(),
				oResourceBundle = this.getResourceBundle(),
				oObject = oView.getModel().getObject(sPath),
				sObjectId = oObject.ObjectID,
				sObjectName = oObject.ID,
				oViewModel = this.getModel("detailView");

            this.getOwnerComponent().oListSelector.selectAListItem(sPath);
            this._populateDescriptionsList(sPath);
            this._populateAttachmentsList(sPath);

			oViewModel.setProperty("/shareSendEmailSubject",
				oResourceBundle.getText("shareSendEmailObjectSubject", [sObjectId]));
			oViewModel.setProperty("/shareSendEmailMessage",
				oResourceBundle.getText("shareSendEmailObjectMessage", [sObjectName, sObjectId, location.href]));
		},

		_onMetadataLoaded : function () {
			// Store original busy indicator delay for the detail view
			var iOriginalViewBusyDelay = this.getView().getBusyIndicatorDelay(),
				oViewModel = this.getModel("detailView"),
				oLineItemTable = this.byId("lineItemsList"),
				iOriginalLineItemTableBusyDelay = oLineItemTable.getBusyIndicatorDelay();

			// Make sure busy indicator is displayed immediately when
			// detail view is displayed for the first time
			oViewModel.setProperty("/delay", 0);
			oViewModel.setProperty("/lineItemTableDelay", 0);

			oLineItemTable.attachEventOnce("updateFinished", function() {
				// Restore original busy indicator delay for line item table
				oViewModel.setProperty("/lineItemTableDelay", iOriginalLineItemTableBusyDelay);
			});

			// Binding the view will set it to not busy - so the view is always busy if it is not bound
			oViewModel.setProperty("/busy", true);
			// Restore original busy indicator delay for the detail view
			oViewModel.setProperty("/delay", iOriginalViewBusyDelay);
		},

		/**
		 * Set the full screen mode to false and navigate to master page
		 */
		onCloseDetailPress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			// No item should be selected on master after detail page is closed
			this.getOwnerComponent().oListSelector.clearMasterListSelection();
			this.getRouter().navTo("master");
		},

		/**
		 * Toggle between full and non full screen mode.
		 */
		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/midColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "MidColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout",  this.getModel("appView").getProperty("/previousLayout"));
			}
        },
        _populateAttachmentsList: function(sPath) {
			var oView = this.getView();
			var list = oView.byId("attachmentsList");
			var attachments = this.getModel().getObject(sPath).ServiceRequestAttachmentFolder;
			var attachmentModel = new JSONModel(attachments);
			oView.setModel(attachmentModel, "AttachmentModel");
			oView.getModel("AttachmentModel").refresh();
			var listItems = list.getItems(),
				mockData = this.getOwnerComponent().mockData;
			for (var i = 0; i < listItems.length; i++) {
				listItems[i].data("uri", mockData ? (attachments[i].__metadata ? attachments[i].__metadata.uri + "/Binary/$value" : attachments[i]) : attachments[i].__metadata.uri + "/Binary/$value");
			}
			// this.app.setBusy(false);
        },
        _populateDescriptionsList: function(sPath) {
            var list = this.getView().byId("descriptionsList");
            // //////
//                 var oModel = this.getView().getModel();
//             var filter1 = new sap.ui.model.Filter("ID", "EQ", 272);
//             var filter2 = new sap.ui.model.Filter("TypeCode", "EQ", "2574");
//             var filter3 = new sap.ui.model.Filter("ProcessingTypeCode", "EQ", "0010");
// 			var oFilters = new sap.ui.model.Filter({
// 				filters: [filter1, filter2, filter3],
// 				and: true
//             });
//             // var oFilters1 = new sap.ui.model.Filter({
// 			// 	filters: [oFilters, filter3],
// 			// 	and: true
// 			// });
// var that = this;
//                 oModel.read("/ActivityCollection", {
//                     urlParameters: {
// 					"$expand": "ActivityText"
// 				},
// 				filters: [oFilters],
// 				// sorters: [new sap.ui.model.Sorter("marker", true), new sap.ui.model.Sorter("DOCNAME", false)], //RaviTiwari:-> Added Sorter to List Alphabatically
// 				success: function (oData, oResponse) {

// 					that.getView().byId('UploadCollection').getModel("osolReqDocModel").setData(oData.results);

// 				},
// 				error: function (oError) {

// 					var msg = "Error Fetching Documents against the Solutioning Request";
// 					sap.m.MessageToast.show(msg);

// 				}
// 			});
            // ////
			var descriptions = this.getModel().getObject(sPath).ServiceRequestTextCollection;

			list.removeAllItems();
			if (descriptions.forEach) {
				descriptions.sort(function(a, b) {
					return a.CreatedOn.getTime() - b.CreatedOn.getTime();
				});
				var sender, info, typeCode;
				descriptions.forEach(function(description) {
					typeCode = description.TypeCode;
					if (typeCode === "10004") {
						sender = description.AuthorName;
						info = "Description";
					} else if (typeCode === "10008") {
						sender = description.AuthorName;
						info = "Reply from Customer";
					} else if (typeCode === "10007" || typeCode === '10011') {
						sender = "Service Agent";
						info = "Reply to Customer";
					} else if (typeCode === "10008") {
						sender = description.AuthorName;
						info = "Reply from Customer";
					}
					list.addItem(new FeedListItem({
						showIcon: false,
						sender: sender,
						text: description.Text,
						info: info,
						timestamp: description.CreatedOn.toLocaleString()
					}));
				});
			}
        },
        onPost: function(oEvent) {
			var view = this.getView(),
				model = view.getModel(),
				sPath = view.getElementBinding().getPath(),
				authorUUID = this.getOwnerComponent().contactUUID,
				text = oEvent.getSource().getValue();
			
				var url = model.sServiceUrl + sPath + "/ServiceRequestTextCollection",
					token = model.getSecurityToken();
				this.app.setBusy(true);
				jQuery.ajax({
					url: url,
					method: "POST",
					contentType: "application/json",
					headers: {
						"X-CSRF-TOKEN": token
					},
					data: JSON.stringify({
						TypeCode: "10008",
						AuthorUUID: authorUUID,
						Text: text
					}),
					success: function() {
                        this.getModel().refresh();
                        this.app.setBusy(true);
					}.bind(this),
					error: function(jqXHR) {
						var error = jqXHR.responseJSON.error.message.value;
                        MessageBox.error(error);
                        this.app.setBusy(true);
					},
					complete: function() {
						this.app.setBusy(false);
					}.bind(this)
				});
		},
        onEdit: function() {
			this._setEditMode(true);
        },
        _setEditMode: function(isEdit) {
			var view = this.getView();
			view.byId("save").setVisible(isEdit);
			view.byId("cancel").setVisible(isEdit);
			view.byId("edit").setVisible(!isEdit);
			// view.byId("infoPrioritySelect").setEnabled(isEdit);
			// view.byId("infoProductCategorySelect").setEnabled(isEdit);
			// view.byId("infoServiceCategorySelect").setEnabled(isEdit);
            // view.byId("infoIncidentCategorySelect").setEnabled(isEdit);
            // view.byId("infoStatusSelect").setEnabled(isEdit);
            // view.byId("infoSubjectID").setEnabled(isEdit);
            // view.byId("infoIncidentCategorySelect").setEnabled(isEdit);
        },
        onFileChange: function(oEvent) {
			this.fileToUpload = oEvent.getParameter("files")["0"];
		},
		onFileUpload: function() {
			if (this.fileToUpload) {
				this.app.setBusy(true);
				var fileReader = new FileReader();
				fileReader.onload = this.uploadFile.bind(this);
				fileReader.readAsBinaryString(this.fileToUpload);
			} else {
				MessageBox.show("No file was selected");
			}
		},
		uploadFile: function(e) {
			var view = this.getView(),
				model = view.getModel(),
				sPath = view.getElementBinding().getPath();

			if (!this.getOwnerComponent().mockData) {
				var url = model.sServiceUrl + sPath + "/ServiceRequestAttachmentFolder",
					token = model.getSecurityToken();
				var dataMock = {
					Name: this.fileToUpload.name,
					Binary: window.btoa(e.target.result)
				};
				jQuery.ajax({
					url: url,
					method: "POST",
					contentType: "application/json",
					headers: {
						"X-CSRF-TOKEN": token
					},
					data: JSON.stringify(dataMock),
					success: function() {
						view.byId("fileUploader").clear();
                        this.fileToUpload = null;
                        this.app.setBusy(false);
						MessageToast.show("The attachment was uploaded successfully");
						this.getModel().refresh();
					}.bind(this),
					error: function(jqXHR) {
						var elm = jqXHR.responseXML.getElementsByTagName("message")[0];
						var error = elm.innerHTML || elm.textContent;
                        MessageBox.error(error);
                        this.app.setBusy(false);
					},
					complete: function() {
						this.app.setBusy(false);
					}.bind(this)
				});
			} else {
				var data = {
					Name: this.fileToUpload.name,
					fileBlob: new Blob([this.fileToUpload], {type: "any"})
				};
				var attachmentData = model.getData().ServiceRequestCollection[parseInt(view.getElementBinding().getPath().split("/")[2])].ServiceRequestAttachmentFolder;
				attachmentData.push(data);
				model.refresh();
				view.byId("fileUploader").clear();
				this.fileToUpload = null;
				MessageToast.show("The attachment was uploaded successfully");
				this._populateAttachmentsList(view.getElementBinding().getPath());
			}
        },
        onCancel: function() {
			this._setEditMode(false);
		},
		onSave: function() {
			var view = this.getView(),
				model = view.getModel();
			var patch = {
				ServiceRequestUserLifeCycleStatusCode: view.byId("infoStatusSelect").getSelectedKey(),
				// ProductID: view.byId("infoProductCategorySelect").getSelectedKey()
				// ServiceIssueCategoryID: view.byId("infoServiceCategorySelect").getSelectedKey(),
				// IncidentServiceIssueCategoryID: view.byId("infoIncidentCategorySelect").getSelectedKey()
			};

			var patchMock = {
				ServiceSatusCode: view.byId("infoStatusSelect").getSelectedKey(),
				ServiceStatusCodeText: view.byId("infoStatusSelect").getSelectedItem().getProperty("text"),
				// ProductID: view.byId("infoProductCategorySelect").getSelectedKey()
				// ServiceIssueCategoryID: view.byId("infoServiceCategorySelect").getSelectedKey()
			};

			if (this.getOwnerComponent().mockData) {
				var sPathMock = view.getElementBinding().getPath(),
					ind = parseInt(sPathMock.split('/')[2]),
					data = model.getData(),
					arr = data.ServiceRequestCollection,
					objToUpdate = arr[ind];
				jQuery.extend(true, objToUpdate, patchMock);
				MessageToast.show("The service request was updated successfully");
				model.setData(data);
				model.refresh(true);
				this._setEditMode(false);
			} else {
				this.app.setBusy(true);
				var sPath = view.getElementBinding().getPath(),
					url = model.sServiceUrl + sPath,
					token = model.getSecurityToken();
				jQuery.ajax({
					url: url,
					method: "PATCH",
					contentType: "application/json",
					headers: {
						"X-CSRF-TOKEN": token
					},
					data: JSON.stringify(patch),
					success: function() {
                        MessageToast.show("The service request was updated successfully");
                        this.app.setBusy(false);
						this.getModel().refresh();
					}.bind(this),
					error: function(jqXHR) {
						var elm = jqXHR.responseXML.getElementsByTagName("message")[0];
                        var error = elm.innerHTML || elm.textContent;
                        this.app.setBusy(false);
						MessageBox.error(error);
					},
					complete: function() {
						this.app.setBusy(false);
						this._setEditMode(false);
					}.bind(this)
				});
			}
		},
	});

});