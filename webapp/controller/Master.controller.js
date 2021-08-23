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

	return BaseController.extend("servicerequests.controller.Master", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the master list controller is instantiated. It sets up the event handling for the master/detail communication and other lifecycle tasks.
		 * @public
		 */
		onInit : function () {
			// Control state model
			var oList = this.byId("list"),
				oViewModel = this._createViewModel(),
				// Put down master list's original value for busy indicator delay,
				// so it can be restored later on. Busy handling on the master list is
				// taken care of by the master list itself.
				iOriginalBusyDelay = oList.getBusyIndicatorDelay();


			this._oList = oList;
			// keeps the filter and search state
			this._oListFilterState = {
				aFilter : [],
				aSearch : []
			};

			this.setModel(oViewModel, "masterView");
			// Make sure, busy indication is showing immediately so there is no
			// break after the busy indication for loading the view's meta data is
			// ended (see promise 'oWhenMetadataIsLoaded' in AppController)
			oList.attachEventOnce("updateFinished", function(){
				// Restore original busy indicator delay for the list
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			});

			this.getView().addEventDelegate({
				onBeforeFirstShow: function () {
					this.getOwnerComponent().oListSelector.setBoundMasterList(oList);
				}.bind(this)
			});

			this.getRouter().getRoute("master").attachPatternMatched(this._onMasterMatched, this);
			this.getRouter().attachBypassed(this.onBypassed, this);
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * After list data is available, this handler method updates the
		 * master list counter
		 * @param {sap.ui.base.Event} oEvent the update finished event
		 * @public
		 */
		onUpdateFinished : function (oEvent) {
			// update the master list object counter after new data is loaded
			this._updateListItemCount(oEvent.getParameter("total"));
		},

		/**
		 * Event handler for the master search field. Applies current
		 * filter value and triggers a new search. If the search field's
		 * 'refresh' button has been pressed, no new search is triggered
		 * and the list binding is refresh instead.
		 * @param {sap.ui.base.Event} oEvent the search event
		 * @public
		 */
		onSearch : function (oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
				return;
			}

			var sQuery = oEvent.getParameter("query");

			if (sQuery) {
				this._oListFilterState.aSearch = [new Filter("ID", FilterOperator.Contains, sQuery)];
			} else {
				this._oListFilterState.aSearch = [];
			}
			this._applyFilterSearch();

		},

		/**
		 * Event handler for refresh event. Keeps filter, sort
		 * and group settings and refreshes the list binding.
		 * @public
		 */
		onRefresh : function () {
			this._oList.getBinding("items").refresh();
		},

		/**
		 * Event handler for the filter, sort and group buttons to open the ViewSettingsDialog.
		 * @param {sap.ui.base.Event} oEvent the button press event
		 * @public
		 */
		onOpenViewSettings : function (oEvent) {
			var sDialogTab = "filter";
			if (oEvent.getSource() instanceof sap.m.Button) {
				var sButtonId = oEvent.getSource().getId();
				if (sButtonId.match("sort")) {
					sDialogTab = "sort";
				} else if (sButtonId.match("group")) {
					sDialogTab = "group";
				}
			}
			// load asynchronous XML fragment
			if (!this.byId("viewSettingsDialog")) {
				Fragment.load({
					id: this.getView().getId(),
					name: "servicerequests.view.ViewSettingsDialog",
					controller: this
				}).then(function(oDialog){
					// connect dialog to the root view of this component (models, lifecycle)
					this.getView().addDependent(oDialog);
					oDialog.addStyleClass(this.getOwnerComponent().getContentDensityClass());
					oDialog.open(sDialogTab);
				}.bind(this));
			} else {
				this.byId("viewSettingsDialog").open(sDialogTab);
			}
		},

		/**
		 * Event handler called when ViewSettingsDialog has been confirmed, i.e.
		 * has been closed with 'OK'. In the case, the currently chosen filters, sorters or groupers
		 * are applied to the master list, which can also mean that they
		 * are removed from the master list, in case they are
		 * removed in the ViewSettingsDialog.
		 * @param {sap.ui.base.Event} oEvent the confirm event
		 * @public
		 */
		onConfirmViewSettingsDialog : function (oEvent) {

			this._applySortGroup(oEvent);
		},

		/**
		 * Apply the chosen sorter and grouper to the master list
		 * @param {sap.ui.base.Event} oEvent the confirm event
		 * @private
		 */
		_applySortGroup: function (oEvent) {
			var mParams = oEvent.getParameters(),
				sPath,
				bDescending,
				aSorters = [];
			sPath = mParams.sortItem.getKey();
			bDescending = mParams.sortDescending;
			aSorters.push(new Sorter(sPath, bDescending));
			this._oList.getBinding("items").sort(aSorters);
		},

		/**
		 * Event handler for the list selection event
		 * @param {sap.ui.base.Event} oEvent the list selectionChange event
		 * @public
		 */
		onSelectionChange : function (oEvent) {
			var oList = oEvent.getSource(),
				bSelected = oEvent.getParameter("selected");

			// skip navigation when deselecting an item in multi selection mode
			if (!(oList.getMode() === "MultiSelect" && !bSelected)) {
				// get the list item, either from the listItem parameter or from the event's source itself (will depend on the device-dependent mode).
				this._showDetail(oEvent.getParameter("listItem") || oEvent.getSource());
			}
		},

		/**
		 * Event handler for the bypassed event, which is fired when no routing pattern matched.
		 * If there was an object selected in the master list, that selection is removed.
		 * @public
		 */
		onBypassed : function () {
			this._oList.removeSelections(true);
		},

		/**
		 * Used to create GroupHeaders with non-capitalized caption.
		 * These headers are inserted into the master list to
		 * group the master list's items.
		 * @param {Object} oGroup group whose text is to be displayed
		 * @public
		 * @returns {sap.m.GroupHeaderListItem} group header with non-capitalized caption.
		 */
		createGroupHeader : function (oGroup) {
			return new GroupHeaderListItem({
				title : oGroup.text,
				upperCase : false
			});
		},

		/**
		 * Event handler for navigating back.
		 * We navigate back in the browser historz
		 * @public
		 */
		onNavBack : function() {
			// eslint-disable-next-line sap-no-history-manipulation
			history.go(-1);
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */


		_createViewModel : function() {
			return new JSONModel({
				isFilterBarVisible: false,
				filterBarLabel: "",
				delay: 0,
				title: this.getResourceBundle().getText("masterTitleCount", [0]),
				noDataText: this.getResourceBundle().getText("masterListNoDataText"),
				sortBy: "ID",
				groupBy: "None"
			});
		},

		_onMasterMatched :  function() {
			//Set the layout property of the FCL control to 'OneColumn'
			this.getModel("appView").setProperty("/layout", "OneColumn");
		},

		/**
		 * Shows the selected item on the detail page
		 * On phones a additional history entry is created
		 * @param {sap.m.ObjectListItem} oItem selected Item
		 * @private
		 */
		_showDetail : function (oItem) {
			var bReplace = !Device.system.phone;
			// set the layout property of FCL control to show two columns
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getRouter().navTo("object", {
				objectId : oItem.getBindingContext().getProperty("ObjectID")
			}, bReplace);
		},

		/**
		 * Sets the item count on the master list header
		 * @param {integer} iTotalItems the total number of items in the list
		 * @private
		 */
		_updateListItemCount : function (iTotalItems) {
			var sTitle;
			// only update the counter if the length is final
			if (this._oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("masterTitleCount", [iTotalItems]);
				this.getModel("masterView").setProperty("/title", sTitle);
			}
		},

		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @private
		 */
		_applyFilterSearch : function () {
			var aFilters = this._oListFilterState.aSearch.concat(this._oListFilterState.aFilter),
				oViewModel = this.getModel("masterView");
			this._oList.getBinding("items").filter(aFilters, "Application");
			// changes the noDataText of the list in case there are no filter results
			if (aFilters.length !== 0) {
				oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("masterListNoDataWithFilterOrSearchText"));
			} else if (this._oListFilterState.aSearch.length > 0) {
				// only reset the no data text to default when no new search was triggered
				oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("masterListNoDataText"));
			}
		},

		/**
		 * Internal helper method that sets the filter bar visibility property and the label's caption to be shown
		 * @param {string} sFilterBarText the selected filter value
		 * @private
		 */
		_updateFilterBar : function (sFilterBarText) {
			var oViewModel = this.getModel("masterView");
			oViewModel.setProperty("/isFilterBarVisible", (this._oListFilterState.aFilter.length > 0));
			oViewModel.setProperty("/filterBarLabel", this.getResourceBundle().getText("masterFilterBarText", [sFilterBarText]));
        },
        onAdd: function(context) {
			if (!this.oDialog) {
				var _self = this;
				this.oDialog = sap.ui.xmlfragment("servicerequests.fragment.Create", this);
				var dialogModel = new JSONModel();
				dialogModel.setProperty("createEnabled", false);
				dialogModel.setProperty("titleInput", '');
				dialogModel.setProperty("descriptionInput", '');
				var incidentModel = new JSONModel({results: []});
				this.oDialog.setModel(incidentModel, "IncidentModel");
				// var isMock = this.getOwnerComponent().mockData;
				// if (isMock) {
				// 	var mockModel = new JSONModel(jQuery.sap.getModulePath("ServiceRequests") + "/mock/serviceMockData.json");
				// 	mockModel.attachRequestCompleted(function() {
				// 		_self.oDialog.setModel(new JSONModel(this.getData().ServiceRequest), "ServiceRequest");
				// 		_self.oDialog.open();
				// 	});
				// } else {
                    this.oDialog.setModel(this.getOwnerComponent().getModel(), "ServiceRequest");
                    this.oDialog.open();
				// }
				// this.oDialog.setModel(dialogModel);
				// this.oDialog.attachAfterClose(function() {
				// 	this.oDialog.destroy();
				// 	this.oDialog = null;
				// }.bind(this));
				// this.getView().addDependent(this.oDialog);
				// this.oDialog.attachAfterOpen(function() {
				// 	this.onDialogOpen(context);
				// }.bind(this));
				// if (!isMock) {
				// 	this.oDialog.open();
				// }
			}

        },
        onDialogAdd: function() {
			this.createTicket();
		},
		onFileChange: function(oEvent) {
			this.fileToUpload = oEvent.getParameter("files")["0"];
		},
		createTicket: function() {
			var view = this.getView(),
				core = sap.ui.getCore(),
				titleInput = core.byId("createTitle"),
                descriptionInput = core.byId("createDescription"),
                priorityInput = core.byId("createPriority"),
                statusInput = core.byId("createStatus"),
                produvtCategoryInput = core.byId("createProductCategory"),
                serviceCategoryInput = core.byId("createServiceCategory"),
                accountInput = core.byId("createAccount"),
                glContactInput = core.byId("createContact");

            titleInput.setValueState(titleInput.getValue() ? "None" : "Error");
			// descriptionInput.setValueState(descriptionInput.getValue() ? "None" : "Error");
			if (!titleInput.getValue()) {
				return;
			}

			
            // var data = {
			// 	ReporterPartyID: this.contactID,
			// 	Name: {
			// 		content: titleInput.getValue()
			// 	},
			// 	ServiceRequestLifeCycleStatusCode: "1",
			// 	ServicePriorityCode: core.byId("createPriority").getSelectedKey(),
			// 	ProductID: core.byId("createProductCategory").getSelectedKey(),
			// 	ServiceIssueCategoryID: core.byId("createServiceCategory").getSelectedKey(),
			// 	IncidentServiceIssueCategoryID: core.byId("createIncidentCategory").getSelectedKey()
            // };
            var data = {
                "ProcessingTypeCode":"ZDO",
                "ProductRecipientPartyID": "DC100",
                "IncidentServiceIssueCategoryID": "GIM-CN",
                "ProcessingTypeCode": "ZDO",
                "Name": core.byId("createTitle").getValue(),
                "ServicePriorityCode": core.byId("createPriority").getSelectedKey()
                // "ServiceStatusCode": core.byId("createStatus").getSelectedKey()
            };

            var model = view.getModel(),
					url = model.sServiceUrl + "/ServiceRequestCollection",
                    token = model.getSecurityToken();
                    var that=this;
				jQuery.ajax({
					url: url,
					method: "POST",
					contentType: "application/json",
					headers: {
						"X-CSRF-TOKEN": token
                    },
                    // {"ProductRecipientPartyID":"DC100","IncidentServiceIssueCategoryID":"GIM-CN","ProcessingTypeCode":"ZDO","Name":"TestAttachment"}
					data: JSON.stringify(data),
					success: this.setTicketDescription.bind(this),
					error: function(jqXHR) {
						var elm = jqXHR.responseXML.getElementsByTagName("message")[0];
						var error = elm.innerHTML || elm.textContent;
						MessageBox.error(error);
						this.oDialog.setBusy(false);
					}.bind(this)
				});
            

        },
        onDialogCancel: function() {
			this.oDialog.close();
        },
        onFileChangeCreate: function(oEvent) {
			this.fileToUpload = oEvent.getParameter("files")["0"];
        },
        onFileUpload: function() {
			if (this.fileToUpload) {
				// this.app.setBusy(true);
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
						MessageToast.show("The attachment was uploaded successfully");
						this.getModel().refresh();
					}.bind(this),
					error: function(jqXHR) {
						var elm = jqXHR.responseXML.getElementsByTagName("message")[0];
						var error = elm.innerHTML || elm.textContent;
						MessageBox.error(error);
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

        onUploadAttachment: function() {
            var model = view.getModel();
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
						MessageToast.show("The attachment was uploaded successfully");
						this.getModel().refresh();
					}.bind(this),
					error: function(jqXHR) {
						var elm = jqXHR.responseXML.getElementsByTagName("message")[0];
						var error = elm.innerHTML || elm.textContent;
						MessageBox.error(error);
					},
					complete: function() {
						this.app.setBusy(false);
					}.bind(this)
				});
        },
        setTicketDescription: function(result) {
			if (!this.mockData) {
				var model = this.getModel(),
					authorUUID = this.component.contactUUID,
					elm = result.getElementsByTagName("id")[0],
					baseUrl = elm.innerHTML || elm.textContent,
					url = baseUrl + "/ServiceRequestTextCollection",
					text = sap.ui.getCore().byId("createDescription").getValue(),
					token = model.getSecurityToken();
				jQuery.ajax({
					url: url,
					method: "POST",
					contentType: "application/json",
					headers: {
						"X-CSRF-TOKEN": token
					},
					data: JSON.stringify({
						TypeCode: "10004",
						AuthorUUID: authorUUID,
						Text: text
					}),
					success: function() {
						this.uploadAttachment(result);
					}.bind(this),
					error: function(jqXHR) {
						var error = jqXHR.responseJSON.error.message.value;
						MessageBox.error("The service request was created successfully, but a description could not be set: " + error);
						this.oDialog.setBusy(false);
					}
				});
			} else {
				var serviceData = result.ServiceRequestDescription;
				var user = sap.ushell.Container.getUser();
				var dataDescription = {
					TypeCode: "10004",
					AuthorName: user.getFullName(),
					Text: sap.ui.getCore().byId("createDescription").getValue(),
					CreatedOn: new Date()
				};
				serviceData.push(dataDescription);
				this.uploadAttachment(result);
			}
		},
		uploadAttachment: function(result) {
			if (this.fileToUpload) {
				var fileReader = new FileReader();
				fileReader.onload = function(e) {
					this.uploadFile(e, result);
				}.bind(this);
				fileReader.readAsBinaryString(this.fileToUpload);
			} else {
				this.finishCreateTicket(result);
			}
		},
		uploadFile: function(e, result) {
			var model = this.getModel();
			if (!this.mockData) {
				var elmMock = result.getElementsByTagName("id")[0],
					baseUrl = elmMock.innerHTML || elmMock.textContent,
					url = baseUrl + "/ServiceRequestAttachmentFolder",
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
					success: this.finishCreateTicket.bind(this),
					error: function(jqXHR) {
						var elm = jqXHR.responseXML.getElementsByTagName("message")[0];
						var error = elm.innerHTML || elm.textContent;
						MessageBox.error("The service request was created successfully, but the attachment could not be uploaded: " + error);
						this.oDialog.setBusy(false);
					}
				});
			} else {
				var data = {
					Name: this.fileToUpload.name,
					fileBlob: new Blob([this.fileToUpload], {type: "any"})
				};

				var attachmentData = result.ServiceRequestAttachmentFolder;
				attachmentData.push(data);
				this.finishCreateTicket(result);
			}
			this.fileToUpload = null;
		},
		finishCreateTicket: function(data) {
			var model = this.getModel(),
				modelData = model.getData();
			if (data && this.mockData) {
				var arrayToInsert = [data],
					oldData = modelData.ServiceRequestCollection,
					newArr = arrayToInsert.concat(oldData);
				model.setData({ServiceRequestCollection: newArr});
			}
			MessageToast.show("The service request was created successfully");
			this.oDialog.setBusy(false);
			this._oList.removeSelections();
			model.refresh();
			this.oDialog.close();
			if (this.mockData) {
				this.updateMockItemDetails();
			}
		},

//         client.onload = function() {
//             	if (this.status == 200 || this.status == 201) {
// 		var oResult = {
// 			response: this.response,
// 			responseHeaders: client.getResponseHeader("x-csrf-token")
// 		};
// 		resolve(oResult);
// 	} else {
// 		reject(this.statusText);
// 	}
// },
        
        http: function (url) {
			var core = {
				ajax: function (method, url, headers, args, mimetype) {
					var promise = new Promise(function (resolve, reject) {
						var client = new XMLHttpRequest();
						var uri = url;
						if (args && method === 'GET') {
							uri += '?';
							var argcount = 0;
							for (var key in args) {
								if (args.hasOwnProperty(key)) {
									if (argcount++) {
										uri += '&';
									}
									uri += encodeURIComponent(key) + '=' + encodeURIComponent(args[key]);
								}
							}
						}
						if (args && (method === 'POST' || method === 'PUT')) {
							var data = {};
							for (var keyp in args) {
								if (args.hasOwnProperty(keyp)) {
									data[keyp] = args[keyp];
								}
							}
						}
						client.open(method, uri);
						if (method === 'POST' || method === 'PUT') {
							client.setRequestHeader("accept", "application/json");
							client.setRequestHeader("content-type", "application/json");
						}
						for (var keyh in headers) {
							if (headers.hasOwnProperty(keyh)) {
								client.setRequestHeader(keyh, headers[keyh]);
							}
						}
						if (data) {
							client.send(JSON.stringify(data));
						} else {
							client.send();
						}
						client.onload = function () {
							if (this.status == 200 || this.status == 201) {
								var oResult = {
									response: this.response,
									responseHeaders: client.getResponseHeader("x-csrf-token")
								};
								resolve(oResult);
							} else {
								reject(this.statusText);
							}
						};
						client.onerror = function () {
							reject(this.statusText);
						};
					});
					return promise;
				}
			};

			return {
				'get': function (headers, args) {
					return core.ajax('GET', url, headers, args);
				},
				'post': function (headers, args) {
					return core.ajax('POST', url, headers, args);
				},
				'put': function (headers, args) {
					return core.ajax('PUT', url, headers, args);
				},
				'delete': function (headers, args) {
					return core.ajax('DELETE', url, headers, args);
				}
			};
        },
        // createTicket: function () {
		// 	sap.ui.core.BusyIndicator.show();

		// 	// var oMailModel = this.getView().getModel("mailModel");

		// 	var oMail = {
		// 		// to: oMailModel.getProperty("/to"),
		// 		// subject: oMailModel.getProperty("/subject"),
		// 		// body: oMailModel.getProperty("/body")
		// 	};

		// 	var oHeaders = {
		// 		"X-CSRF-TOKEN": "fetch"
		// 	};

		// 	// this.http("/SendRequest").get(oHeaders).then(function (result) {
		// 	// 	oHeaders = {
		// 	// 		"X-CSRF-TOKEN":  result.responseHeaders
		// 	// 	};
		// 		this.http("/SendRequest").post(oHeaders, oMail).then(function () {
		// 			sap.ui.core.BusyIndicator.hide();
		// 			var oBundle = this.getView().getModel("i18n").getResourceBundle();
		// 			var sMsg = oBundle.getText("NotificationSentSuccess");
		// 			return MessageToast.show(sMsg);
		// 		}.bind(this)).catch(function () {
		// 			sap.ui.core.BusyIndicator.hide();
		// 			var oBundle = this.getView().getModel("i18n").getResourceBundle();
		// 			MessageBox.error(oBundle.getText("sendNotificationError"));
		// 		}.bind(this));
		// 	}.bind(this));
		// },

	});

});