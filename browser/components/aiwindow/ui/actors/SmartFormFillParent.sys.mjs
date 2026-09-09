/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AIWindow:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  GetPageContent: "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs",
  MAX_SELECTED_TABS:
    "chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs",
  Region: "resource://gre/modules/Region.sys.mjs",
  NonPrivateTabs: "resource:///modules/OpenTabs.sys.mjs",
  SmartFormFillController:
    "moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillController.sys.mjs",
  SmartFormFillAutocomplete:
    "moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillAutocomplete.sys.mjs",
  SmartFormFillTelemetry:
    "moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillTelemetry.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "console", function () {
  return console.createInstance({ prefix: "SmartFormFillParent" });
});

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "disallowedRegions",
  "browser.smartwindow.smartformfill.disallowedRegions",
  ""
);

/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillController.sys.mjs").SmartFormFillController} Controller */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillController.sys.mjs").SelectedTab} SelectedTab */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillDocument.sys.mjs").FormData} FormData */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillDocument.sys.mjs").FocusedForm} FocusedForm  */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").PageInfo} PageInfo */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillAutocomplete.sys.mjs").SmartFormFillAutocompleteSource} SmartFormFillAutocompleteSource */

/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").ClassificationResponse} ClassificationResponse */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").ClassifyFieldsRequestBody} ClassifyFieldsRequestBody */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").GenerateFormValuesRequestBody} GenerateFormValuesRequestBody */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").GenerateFormValuesResponse} GenerateFormValuesResponse */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").RelevantTabRequestBody} RelevantTabRequestBody */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").RelevantTabsResponse} RelevantTabsResponse */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").FieldData} FieldData */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").FieldClassification} FieldClassification */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillTelemetry.sys.mjs").FieldDecision} FieldDecision */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillTelemetry.sys.mjs").ModelInfo} ModelInfo */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillTelemetry.sys.mjs").RequestFlow} RequestFlow */

/**
 * What a generation round produced, beyond the values the page is asked to
 * fill.
 *
 * @typedef {{
 *   formId: string,
 *   fieldsFilled: number,
 *   response: GenerateFormValuesResponse,
 *   fields: Array<FieldData>,
 *   formFields: Array<FieldData>,
 *   classifications: Map<string, FieldClassification>,
 *   tokensByFieldId: Map<string, string>,
 * }} GenerationResult
 */

/**
 * How the controller reports the requests it makes. A dispatch callback answers
 * with the flow the request belongs to, which is handed back on the matching
 * answer or failure so the two can be paired. The controller treats it as
 * opaque, so resolving flow ids stays here.
 *
 * @typedef {{
 *   onRelevantTabsDispatched: (formId: string, request: RelevantTabRequestBody, modelInfo: ModelInfo) => RequestFlow,
 *   onRelevantTabsAnswered: (flow: RequestFlow, response: RelevantTabsResponse, tabsUsed: number) => void,
 *   onRelevantTabsFailed: (flow: RequestFlow, error: Error) => void,
 *   onClassifyDispatched: (formId: string, request: ClassifyFieldsRequestBody, modelInfo: ModelInfo) => RequestFlow,
 *   onClassifyAnswered: (flow: RequestFlow, response: ClassificationResponse) => void,
 *   onClassifyFailed: (flow: RequestFlow, error: Error) => void,
 *   onGenerateDispatched: (formId: string, request: GenerateFormValuesRequestBody, dispatch: object) => RequestFlow,
 *   onGenerateAnswered: (flow: RequestFlow, result: GenerationResult) => void,
 *   onGenerateFailed: (flow: RequestFlow, error: Error) => void,
 * }} RequestObserver
 */

/**
 * @typedef {"idle" | "loading" | "ready" | "failed"} MetadataStatus
 */

/**
 * @typedef {object} FormMetadataState
 * @property {FormData} formData Latest serialized form data.
 * @property {MetadataStatus} relevantTabsStatus Relevant-tab request state.
 * @property {MetadataStatus} classificationStatus Classification request state.
 * @property {Promise<void> | null} relevantTabsPromise Active relevant-tab
 * request.
 * @property {Promise<void> | null} classificationPromise Active classification
 * request.
 * @property {number} relevantTabsRevision Revision used to reject stale
 * relevant-tab responses.
 * @property {number} classificationRevision Revision used to reject stale
 * classification responses.
 */

/**
 * How much page content text to extract
 */
const MAX_PAGE_CONTENT_LENGTH = 10000;

const METADATA_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  FAILED: "failed",
});

const TAB_SELECTOR_URL =
  "chrome://browser/content/aiwindow/smartformfill-tab-select.html";

/**
 * Parent actor for SmartFormFill
 */
export class SmartFormFillParent extends JSWindowActorParent {
  /**
   * Controller for the managed document.
   *
   * @type {Controller | null}
   */
  #controller;

  /**
   * Form associated with the current Smart Form Fill autocomplete entry.
   *
   * @type {string | null}
   */
  #autocompleteFormId;

  /**
   * Current tab-selector dialog.
   *
   * @type {object | null}
   */
  #tabSelectorDialog;

  /**
   * User-selected tabs by form ID.
   *
   * @type {Map<string, Array<SelectedTab>>}
   */
  #userSelectedTabsByFormId;

  /**
   * IDs of the Smart Windows known during the previous tab event.
   *
   * @type {Set<number>}
   */
  #smartWindowIds;

  /**
   * Generation of the latest autofill request
   *
   * @type {number}
   */
  #autofillGeneration;

  /**
   * Metadata request state by stable form ID.
   *
   * @type {Map<string, FormMetadataState>}
   */
  #formMetadataById;

  /**
   * Whether the actor has been destroyed.
   *
   * @type {boolean}
   */
  #destroyed;

  /**
   * Sends the Smart Form Fill glean events for the managed document.
   *
   * @type {SmartFormFillTelemetry}
   */
  #telemetry;

  /**
   * Flow id correlating every event of a form's current round. Minted with the
   * form's metadata and replaced whenever that metadata is invalidated, so one
   * flow is one attempt at filling one form.
   *
   * @type {Map<string, string>}
   */
  #flowIdByFormId;

  /**
   * The model's decision for each field of the latest generation round, by form
   * ID. Kept after the round ends because the field events are only complete
   * once the page reports what it filled, and the outcome of each field is only
   * known when the fill is torn down.
   *
   * @type {Map<string, { flowId: string, decisions: Array<FieldDecision> }>}
   */
  #fieldDecisionsByFormId;

  /**
   * Creates the parent actor.
   */
  constructor() {
    super();

    this.#controller = null;
    this.#autocompleteFormId = null;
    this.#destroyed = false;
    this.#tabSelectorDialog = null;
    this.#userSelectedTabsByFormId = new Map();
    this.#smartWindowIds = new Set();
    this.#autofillGeneration = 0;
    this.#formMetadataById = new Map();
    this.#telemetry = new lazy.SmartFormFillTelemetry();
    this.#flowIdByFormId = new Map();
    this.#fieldDecisionsByFormId = new Map();
  }

  /**
   * Starts listening for browser tab lifecycle changes.
   */
  actorCreated() {
    this.#smartWindowIds = this.#getSmartWindowIds();
    lazy.NonPrivateTabs.addEventListener("TabChange", this);
  }

  /**
   * Handles browser tab lifecycle changes.
   *
   * @param {CustomEvent} event
   */
  handleEvent(event) {
    if (
      event.type != "TabChange" ||
      !event.detail.sourceEvents.some(type =>
        ["TabOpen", "TabClose", "TabAttrModified"].includes(type)
      )
    ) {
      return;
    }

    const currentSmartWindowIds = this.#getSmartWindowIds();
    const smartWindowTabChanged = event.detail.windowIds.some(
      id => currentSmartWindowIds.has(id) || this.#smartWindowIds.has(id)
    );
    this.#smartWindowIds = currentSmartWindowIds;

    if (!smartWindowTabChanged) {
      return;
    }

    this.#tabSelectorDialog?.abort();
    this.#userSelectedTabsByFormId.clear();

    for (const metadata of this.#formMetadataById.values()) {
      ++metadata.relevantTabsRevision;
      metadata.relevantTabsPromise = null;
      metadata.relevantTabsStatus = METADATA_STATUS.IDLE;
    }

    this.#controller?.invalidateTabs();
  }

  /**
   * Gets the effective tab selection for a form.
   *
   * @param {string} formId
   * @returns {Array<SelectedTab>}
   */
  #getSelectedTabsFor(formId) {
    const selectedTabs =
      this.#userSelectedTabsByFormId.get(formId) ??
      this.#controller.getRelevantTabsFor(formId);

    return selectedTabs.map(({ id }) => ({ id }));
  }

  /**
   * Generates and applies values for the focused form.
   *
   * @returns {Promise<void>}
   */
  async triggerAutofill() {
    const focusedForm = await this.#getFocusedForm();
    if (!focusedForm) {
      return;
    }

    const metadata = this.#getFormMetadataState(focusedForm);
    if (metadata.classificationStatus === METADATA_STATUS.FAILED) {
      return;
    }

    this.#startFormMetadataRequests(metadata);

    await Promise.all([
      metadata.relevantTabsPromise,
      metadata.classificationPromise,
    ]);

    if (
      metadata.relevantTabsStatus !== METADATA_STATUS.READY ||
      metadata.classificationStatus !== METADATA_STATUS.READY ||
      this.#cannotAutofill()
    ) {
      return;
    }

    const selectedTabs = this.#getSelectedTabsFor(focusedForm.id);
    await this.#performAutofill(focusedForm, selectedTabs);
  }

  /**
   * Opens the source editor for the focused form.
   *
   * @returns {Promise<void>}
   */
  async #editSources() {
    const focusedForm = await this.#getFocusedForm();
    if (!focusedForm) {
      return;
    }

    const metadata = this.#getFormMetadataState(focusedForm);
    this.#startFormMetadataRequests(metadata);
    await metadata.relevantTabsPromise;

    if (
      metadata.relevantTabsStatus !== METADATA_STATUS.READY ||
      this.#cannotAutofill()
    ) {
      return;
    }

    try {
      const selectedTabs = await this.#selectTabs(focusedForm.id);
      if (this.#destroyed) {
        return;
      }

      if (selectedTabs) {
        this.#userSelectedTabsByFormId.set(focusedForm.id, selectedTabs);
      }
    } finally {
      if (!this.#destroyed) {
        const browser = this.browsingContext?.embedderElement;
        if (browser?.isConnected) {
          browser.focus();
        }

        this.sendAsyncMessage("SmartFormFill:ShowAutocompletePopup");
      }
    }
  }

  /**
   * Presents the tab selector and returns the user's selected tabs.
   *
   * @param {string} formId
   *
   * @returns {Promise<Array<SelectedTab> | null>}
   */
  async #selectTabs(formId) {
    if (this.#tabSelectorDialog) {
      return null;
    }

    const relevantTabs = this.#controller.getRelevantTabsFor(formId);
    const initiallySelectedTabIds = new Set(
      this.#getSelectedTabsFor(formId).map(({ id }) => id)
    );
    const tabsById = new Map(
      this.#controller.getTabs().map(tab => [tab.id, tab])
    );
    const toDialogTab = (tab, pressed) => ({
      ...tab,
      favicon: `page-icon:${tab.url}`,
      pressed,
    });

    const suggestedTabs = relevantTabs
      .map(({ id }) => tabsById.get(id))
      .filter(Boolean)
      .map(tab => toDialogTab(tab, initiallySelectedTabIds.has(tab.id)));
    const suggestedTabIds = new Set(suggestedTabs.map(({ id }) => id));
    const otherTabs = [...tabsById.values()]
      .filter(
        tab =>
          !suggestedTabIds.has(tab.id) &&
          tab.url !== this.manager.documentURI.spec
      )
      .map(tab => toDialogTab(tab, initiallySelectedTabIds.has(tab.id)));
    const selectableTabIds = new Set(
      [...suggestedTabs, ...otherTabs].map(({ id }) => id)
    );

    const browser = this.browsingContext.embedderElement;
    const chromeWindow = this.browsingContext.topChromeWindow;
    if (!browser || !chromeWindow?.gBrowser) {
      return null;
    }

    const dialogArguments = {
      suggestedTabs,
      otherTabs,
      result: null,
    };
    const { dialog, closedPromise } = chromeWindow.gBrowser
      .getTabDialogBox(browser)
      .open(
        TAB_SELECTOR_URL,
        {
          features: "resizable=no",
          allowDuplicateDialogs: false,
        },
        dialogArguments
      );

    if (!dialog) {
      return null;
    }

    this.#tabSelectorDialog = dialog;
    try {
      await closedPromise;
    } finally {
      if (this.#tabSelectorDialog === dialog) {
        this.#tabSelectorDialog = null;
      }
    }

    const selectedTabIds = dialogArguments.result?.selectedTabIds;
    if (
      !Array.isArray(selectedTabIds) ||
      !selectedTabIds.length ||
      selectedTabIds.length > lazy.MAX_SELECTED_TABS ||
      new Set(selectedTabIds).size !== selectedTabIds.length ||
      selectedTabIds.some(id => !selectableTabIds.has(id))
    ) {
      return null;
    }

    return selectedTabIds.map(id => ({ id }));
  }

  /**
   * Receives messages from the child actor.
   *
   * @param {object} param
   * @param {Array<FormData> | undefined} param.data Message data.
   * @param {string} param.name The message type
   *
   * @returns {Promise<boolean> | null | undefined}
   */
  receiveMessage({ data, name }) {
    switch (name) {
      case "SmartFormFill:IsSmartWindow":
        return this.#onIsSmartWindow();

      case "SmartFormFill:FormUpdate":
        return this.#onFormUpdate(data);

      case "SmartFormFill:FieldsFilled":
        return this.#onFieldsFilled(data.id, data.fieldIds);

      case "SmartFormFill:FieldOutcomes":
        return this.#onFieldOutcomes(data.id, data.fields);
    }

    return null;
  }

  /**
   * Destroys controller state.
   */
  didDestroy() {
    lazy.NonPrivateTabs.removeEventListener("TabChange", this);
    this.#tabSelectorDialog?.abort();
    this.#tabSelectorDialog = null;
    this.#userSelectedTabsByFormId.clear();
    this.#smartWindowIds.clear();
    this.#destroyed = true;
    this.#formMetadataById.clear();
    this.#flowIdByFormId.clear();
    this.#fieldDecisionsByFormId.clear();
    this.#controller?.destroy();
    this.#controller = null;
  }

  /**
   * Gets the controller used for demand-driven form metadata.
   *
   * @returns {Controller}
   */
  #getController() {
    if (!this.#controller) {
      this.#controller = new lazy.SmartFormFillController(
        this.#getPageInfo(),
        this.#getRequestObserver()
      );
    }

    return this.#controller;
  }

  /**
   * Gets the currently focused form.
   *
   * @returns {Promise<FocusedForm | null>}
   */
  #getFocusedForm() {
    return this.sendQuery("SmartFormFill:GetFocusedForm").catch(error => {
      if (!this.#destroyed) {
        lazy.console.error("Could not get focused Smart Form Fill form", error);
      }

      return null;
    });
  }

  /**
   * Gets cached metadata state for a form.
   *
   * @param {FocusedForm} focusedForm Focused form data.
   * @returns {FormMetadataState}
   */
  #getFormMetadataState(focusedForm) {
    const formData = {
      id: focusedForm.id,
      fields: focusedForm.fields,
    };
    let metadata = this.#formMetadataById.get(focusedForm.id);

    if (!metadata) {
      metadata = {
        formData,
        relevantTabsStatus: METADATA_STATUS.IDLE,
        classificationStatus: METADATA_STATUS.IDLE,
        relevantTabsPromise: null,
        classificationPromise: null,
        relevantTabsRevision: 0,
        classificationRevision: 0,
      };
      this.#formMetadataById.set(focusedForm.id, metadata);
      this.#flowIdByFormId.set(focusedForm.id, crypto.randomUUID());
    } else if (this.#hasFormStructureChanged(metadata.formData, formData)) {
      this.#invalidateFormMetadata(metadata, formData);
    }

    return metadata;
  }

  /**
   * Checks whether fields were added to or removed from a form.
   *
   * @param {FormData} previousFormData Previously cached form data.
   * @param {FormData} formData Current form data.
   * @returns {boolean} Whether the form field collection changed.
   */
  #hasFormStructureChanged(previousFormData, formData) {
    if (previousFormData.fields.length !== formData.fields.length) {
      return true;
    }

    const previousFieldIds = new Set(
      previousFormData.fields.map(({ id }) => id)
    );
    return formData.fields.some(({ id }) => !previousFieldIds.has(id));
  }

  /**
   * Invalidates cached model metadata after a form structure change.
   *
   * @param {FormMetadataState} metadata Metadata to invalidate.
   * @param {FormData} formData Updated form data.
   */
  #invalidateFormMetadata(metadata, formData) {
    ++metadata.relevantTabsRevision;
    ++metadata.classificationRevision;
    metadata.formData = formData;
    metadata.relevantTabsStatus = METADATA_STATUS.IDLE;
    metadata.classificationStatus = METADATA_STATUS.IDLE;
    metadata.relevantTabsPromise = null;
    metadata.classificationPromise = null;
    this.#controller?.invalidateForm(formData.id);

    // The round this form was on is superseded, so its events stop sharing a
    // flow with the ones the next round will record.
    this.#flowIdByFormId.set(formData.id, crypto.randomUUID());
    this.#fieldDecisionsByFormId.delete(formData.id);
  }

  /**
   * Starts missing metadata requests for a form.
   *
   * @param {FormMetadataState} metadata Form metadata state.
   */
  #startFormMetadataRequests(metadata) {
    if (metadata.relevantTabsStatus === METADATA_STATUS.IDLE) {
      this.#loadRelevantTabs(metadata);
    }

    if (metadata.classificationStatus === METADATA_STATUS.IDLE) {
      this.#loadFieldClassifications(metadata);
    }
  }

  /**
   * Requests relevant tabs for a form.
   *
   * @param {FormMetadataState} metadata Form metadata state.
   * @returns {Promise<void>}
   */
  #loadRelevantTabs(metadata) {
    const revision = metadata.relevantTabsRevision;
    metadata.relevantTabsStatus = METADATA_STATUS.LOADING;

    const request = this.#getController()
      .findRelevantTabs(metadata.formData)
      .catch(error => {
        if (revision === metadata.relevantTabsRevision && !this.#destroyed) {
          lazy.console.error("Could not find relevant tabs", error);
        }
      })
      .then(() => {
        if (revision !== metadata.relevantTabsRevision || this.#destroyed) {
          return;
        }

        metadata.relevantTabsStatus = METADATA_STATUS.READY;
        this.sendAsyncMessage("SmartFormFill:RefreshAutocomplete");
      })
      .finally(() => {
        if (revision === metadata.relevantTabsRevision) {
          metadata.relevantTabsPromise = null;
        }
      });

    metadata.relevantTabsPromise = request;
    return request;
  }

  /**
   * Requests field classifications for a form.
   *
   * @param {FormMetadataState} metadata Form metadata state.
   * @returns {Promise<void>}
   */
  #loadFieldClassifications(metadata) {
    const revision = metadata.classificationRevision;
    metadata.classificationStatus = METADATA_STATUS.LOADING;

    const request = this.#getController()
      .classifyFields(metadata.formData)
      .then(() => {
        if (revision === metadata.classificationRevision && !this.#destroyed) {
          metadata.classificationStatus = METADATA_STATUS.READY;
        }
      })
      .catch(error => {
        if (revision !== metadata.classificationRevision || this.#destroyed) {
          return;
        }

        metadata.classificationStatus = METADATA_STATUS.FAILED;
        lazy.console.error("Could not classify Smart Form Fill fields", error);
        this.sendAsyncMessage("SmartFormFill:RefreshAutocomplete");
      })
      .finally(() => {
        if (revision === metadata.classificationRevision) {
          metadata.classificationPromise = null;
        }
      });

    metadata.classificationPromise = request;
    return request;
  }

  /**
   * Triggers the autofill for the focused form with chosen tabs
   *
   * @param {FocusedForm} focusedForm
   * @param {Array<SelectedTab>} selectedTabs
   *
   * @returns {Promise<void>}
   */
  async #performAutofill(focusedForm, selectedTabs) {
    const generation = ++this.#autofillGeneration;

    if (!focusedForm || this.#cannotApplyAutofill(generation)) {
      return;
    }

    const numberOfTabs = selectedTabs.length + 1;
    const perTabTextCharBudget = Math.ceil(
      MAX_PAGE_CONTENT_LENGTH / numberOfTabs
    );

    const [pageText, tabContentById] = await Promise.all([
      this.#getPageText(this.manager.documentURI.spec, perTabTextCharBudget),
      this.#getTabsContent(selectedTabs, perTabTextCharBudget),
    ]);

    if (this.#cannotApplyAutofill(generation)) {
      return;
    }

    const result = await this.#controller
      .autofill(
        focusedForm.id,
        focusedForm.emptyFieldIds,
        selectedTabs,
        tabContentById,
        pageText
      )
      .catch(error => {
        if (!this.#destroyed) {
          lazy.console.error(
            "Could not generate Smart Form Fill values",
            error
          );
        }

        return null;
      });

    if (!result || this.#cannotApplyAutofill(generation)) {
      return;
    }

    this.sendAsyncMessage("SmartFormFill:FillForm", result);
  }

  /**
   * Gets the page content for each tab
   *
   * @param {Array<SelectedTab>} selectedTabs
   * @param {number} textCharLimitPerTab
   *
   * @returns {Promise<Map<string, string>>}
   */
  async #getTabsContent(selectedTabs, textCharLimitPerTab) {
    const tabContentById = new Map();

    const promises = selectedTabs.map(selectedTab => {
      const tabData = this.#controller.getTabData(selectedTab.id);

      if (tabData) {
        return this.#getPageText(tabData.url, textCharLimitPerTab).then(
          tabContent => {
            tabContentById.set(selectedTab.id, tabContent);
          }
        );
      }

      return Promise.resolve();
    });

    await Promise.allSettled(promises);

    return tabContentById;
  }

  /**
   * Attempts to extract page content from a url if the tab is found
   *
   * @param {string} sourceUrl
   * @param {number} textCharLimit
   *
   * @returns {Promise<string>}
   */
  async #getPageText(sourceUrl, textCharLimit) {
    let windowGlobal = this.manager;

    if (windowGlobal.documentURI.spec !== sourceUrl) {
      const tab = lazy.GetPageContent.getTabWithURL(sourceUrl);
      windowGlobal =
        tab?.linkedBrowser.browsingContext?.currentWindowGlobal ?? null;
    }

    if (!windowGlobal) {
      return "";
    }

    try {
      const pageExtractor = windowGlobal.getActor("PageExtractor");
      const extraction = await pageExtractor.getText({
        sufficientLength: textCharLimit,
        removeBoilerplate: false,
        sourceUrl,
      });

      return extraction?.text ?? "";
    } catch (error) {
      if (!this.#destroyed) {
        lazy.console.error("Could not extract page text", error);
      }

      return "";
    }
  }

  /**
   * Gets information about the current page.
   *
   * @returns {PageInfo}
   */
  #getPageInfo() {
    const windowGlobal = this.manager;

    return {
      url: windowGlobal.documentURI.spec,
      title: windowGlobal.documentTitle,
    };
  }

  /**
   * Gets the IDs of active Smart Windows.
   *
   * @returns {Set<number>}
   */
  #getSmartWindowIds() {
    return new Set(
      lazy.BrowserWindowTracker.orderedWindows
        .filter(window => lazy.AIWindow.isAIWindowActive(window))
        .map(window => window.windowGlobalChild.innerWindowId)
    );
  }

  /**
   * Checks whether autofill can run.
   *
   * @returns {boolean}
   */
  #cannotAutofill() {
    return this.#destroyed || !this.#controller;
  }

  /**
   * Checks whether autofill results may still be applied.
   *
   * @param {number} generation
   *
   * @returns {boolean}
   */
  #cannotApplyAutofill(generation) {
    return this.#cannotAutofill() || generation !== this.#autofillGeneration;
  }

  /**
   * Checks whether this is an active Smart Window in a supported region.
   *
   * @returns {Promise<boolean>}
   */
  async #onIsSmartWindow() {
    if (
      this.#destroyed ||
      !lazy.AIWindow.isAIWindowActive(this.browsingContext.topChromeWindow)
    ) {
      return false;
    }

    // #isDisallowedRegion reads Region.home synchronously.
    try {
      await lazy.Region.init();
    } catch (error) {
      lazy.console.error("Could not initialize Region", error);
    }

    return !this.#destroyed && !this.#isDisallowedRegion();
  }

  /**
   * Checks whether the user's home region is on the Smart Form Fill denylist.
   * An unknown home region is treated as allowed.
   *
   * @returns {boolean}
   */
  #isDisallowedRegion() {
    const homeRegion = lazy.Region.home?.toUpperCase();

    return lazy.disallowedRegions
      .split(",")
      .map(region => region.trim().toUpperCase())
      .filter(Boolean)
      .includes(homeRegion);
  }

  /**
   * Message handler for "SmartFormFill:FormUpdate"
   *
   * @param {Array<FormData>} formDataList
   */
  #onFormUpdate(formDataList) {
    if (this.#destroyed || !Array.isArray(formDataList)) {
      return;
    }

    const formsById = new Map(
      formDataList.map(formData => [formData.id, formData])
    );

    for (const [formId, metadata] of this.#formMetadataById) {
      const formData = formsById.get(formId);

      if (!formData) {
        ++metadata.relevantTabsRevision;
        ++metadata.classificationRevision;
        this.#controller?.invalidateForm(formId);
        this.#formMetadataById.delete(formId);
        this.#flowIdByFormId.delete(formId);
        this.#fieldDecisionsByFormId.delete(formId);
        this.#userSelectedTabsByFormId.delete(formId);
        continue;
      }

      if (this.#hasFormStructureChanged(metadata.formData, formData)) {
        this.#invalidateFormMetadata(metadata, formData);
      }
    }
  }

  /*
   * AutoComplete-related functions
   */

  /**
   * Gets the Smart Form Fill autocomplete entry for the focused field.
   *
   * SmartFormFillAutocomplete calls this when an autocomplete provider
   * requests Smart Form Fill entries.
   *
   * @param {string} _searchString
   *   The current autocomplete search string. Smart Form Fill does not
   *   currently filter its entry using this value.
   * @param {{ focusElementId?: string }} options
   *   Options supplied by SmartFormFillChild.
   * @returns {Promise<{ entries: Array<object> } | null>}
   *   An object containing the Smart Form Fill entry, or null when the entry
   *   should not be shown.
   */
  async searchAutoCompleteEntries(_searchString, options) {
    const focusedForm = await this.#getFocusedForm();
    if (!focusedForm) {
      return null;
    }

    const metadata = this.#getFormMetadataState(focusedForm);

    if (metadata.classificationStatus === METADATA_STATUS.FAILED) {
      return null;
    }

    this.#autocompleteFormId = focusedForm.id;
    this.#startFormMetadataRequests(metadata);

    const entries = await lazy.SmartFormFillAutocomplete.createItemsAsync({
      sffActor: this,
      formId: focusedForm.id,
      focusElementId: options.focusElementId,
    });

    return entries.length ? { entries } : null;
  }

  /**
   * Adds parent-only source metadata after the autocomplete popup opens.
   */
  onAutoCompletePopupOpened() {
    this.#updateAutoCompletePopupSources();
  }

  /**
   * Adds parent-only source metadata after an open autocomplete popup updates.
   */
  onAutoCompletePopupUpdated() {
    this.#updateAutoCompletePopupSources();
  }

  /**
   * Updates the current Smart Form Fill row with its relevant tab sources.
   */
  #updateAutoCompletePopupSources() {
    const formId = this.#autocompleteFormId;
    if (!formId || !this.areRelevantTabsReady(formId)) {
      return;
    }

    lazy.SmartFormFillAutocomplete.updatePopupSources({
      browser: this.browsingContext.top.embedderElement,
      sources: this.getSelectedTabSources(formId),
    });
  }

  /**
   * Handles selection of a Smart Form Fill autocomplete action.
   *
   * AutoCompleteParent calls this using the action name stored in the selected
   * entry's comment metadata.
   *
   * @param {string} message
   *   The selected autocomplete action name.
   * @returns {Promise<void> | undefined}
   *   The autofill operation for the primary action, or undefined for an
   *   unsupported action.
   */
  onAutoCompleteEntrySelected(message) {
    switch (message) {
      case "SmartFormFill:Start":
        return this.triggerAutofill();

      case "SmartFormFill:EditSources":
        return this.#editSources();
    }

    return undefined;
  }

  /**
   * Gets display data for tabs selected for a form.
   *
   * @param {string} formId Stable form identifier.
   * @returns {Array<SmartFormFillAutocompleteSource>}
   *   Display data for selected tabs, or an empty array when unavailable.
   */
  getSelectedTabSources(formId) {
    if (!this.#controller) {
      return [];
    }

    return this.#getSelectedTabsFor(formId)
      .map(({ id }) => this.#controller.getTabData(id))
      .filter(Boolean)
      .map(tab => ({
        label: tab.title || tab.url,
        favicon: `page-icon:${tab.url}`,
      }));
  }

  /**
   * Checks whether relevant-tab selection has completed for a form.
   *
   * @param {string} formId Stable form identifier.
   * @returns {boolean} Whether the relevant-tab result can be displayed.
   */
  areRelevantTabsReady(formId) {
    return (
      this.#formMetadataById.get(formId)?.relevantTabsStatus ===
      METADATA_STATUS.READY
    );
  }

  /**
   * Whether Smart Form Fill has tabs available as context sources.
   *
   * @type {boolean}
   */
  get hasSourceTabs() {
    return Boolean(this.#controller?.hasSourceTabs);
  }

  /**
   * Gets the flow id correlating the events of a form's current round. Empty
   * when the form is gone, which a request in flight can outlive.
   *
   * @param {string} formId
   *
   * @returns {string}
   */
  #getFlowId(formId) {
    return this.#flowIdByFormId.get(formId) ?? "";
  }

  /**
   * Records what the model decided for each field of a form, now that the page
   * has reported which of them it filled.
   *
   * @param {string} formId
   * @param {Array<string>} filledFieldIds
   */
  #onFieldsFilled(formId, filledFieldIds) {
    const round = this.#fieldDecisionsByFormId.get(formId);
    if (!round) {
      return;
    }

    this.#telemetry.sendFillFieldTelemetry(
      round.flowId,
      round.decisions,
      filledFieldIds
    );
  }

  /**
   * Records what became of the fields a round filled, now that the page has
   * reported the state each one ended in.
   *
   * @param {string} formId
   * @param {Array<{ id: string, edited: boolean, isEmpty: boolean }>} fields
   */
  #onFieldOutcomes(formId, fields) {
    const round = this.#fieldDecisionsByFormId.get(formId);
    if (!round) {
      return;
    }

    this.#telemetry.sendFillFieldOutcomeTelemetry(
      round.flowId,
      round.decisions,
      fields
    );
  }

  /**
   * Builds the callbacks the controller reports its requests through.
   *
   * @returns {RequestObserver}
   */
  #getRequestObserver() {
    return {
      onRelevantTabsDispatched: (formId, request, modelInfo) =>
        this.#telemetry.startRelevantTabsRequest(
          this.#getFlowId(formId),
          request,
          modelInfo
        ),

      onRelevantTabsAnswered: (flow, response, tabsUsed) =>
        this.#telemetry.sendRelevantTabsResponseTelemetry(
          flow,
          response,
          tabsUsed
        ),

      onRelevantTabsFailed: (flow, error) =>
        this.#telemetry.sendRelevantTabsErrorTelemetry(flow, error),

      onClassifyDispatched: (formId, request, modelInfo) =>
        this.#telemetry.startClassifyRequest(
          this.#getFlowId(formId),
          request,
          modelInfo
        ),

      onClassifyAnswered: (flow, response) =>
        this.#telemetry.sendClassifyResponseTelemetry(flow, response),

      onClassifyFailed: (flow, error) =>
        this.#telemetry.sendClassifyErrorTelemetry(flow, error),

      onGenerateDispatched: (formId, request, dispatch) =>
        this.#telemetry.startGenerateRequest(
          this.#getFlowId(formId),
          request,
          dispatch
        ),

      onGenerateAnswered: (flow, result) => {
        const {
          formId,
          fieldsFilled,
          response,
          fields,
          formFields,
          classifications,
          tokensByFieldId,
        } = result;

        this.#telemetry.sendGenerateResponseTelemetry(
          flow,
          fieldsFilled,
          response
        );

        this.#fieldDecisionsByFormId.set(formId, {
          flowId: flow.flowId,
          decisions: this.#telemetry.resolveFieldDecisions({
            fields,
            formFields,
            classifications,
            tokensByFieldId,
            values: response,
          }),
        });
      },

      onGenerateFailed: (flow, error) =>
        this.#telemetry.sendGenerateErrorTelemetry(flow, error),
    };
  }
}
