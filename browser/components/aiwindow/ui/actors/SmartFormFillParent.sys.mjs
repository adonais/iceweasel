/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AIWindow:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
  GetPageContent: "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs",
  Region: "resource://gre/modules/Region.sys.mjs",
  SmartFormFillController:
    "moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillController.sys.mjs",
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

/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillController.sys.mjs").InitializationResult} InitializationResult */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillController.sys.mjs").SmartFormFillController} Controller */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillDocument.sys.mjs").FormData} FormData */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillDocument.sys.mjs").FocusedForm} FocusedForm  */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").PageInfo} PageInfo */
/** @typedef {import("moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs").RelevantTab} RelevantTab */

/**
 * How much page content text to extract
 */
const MAX_PAGE_CONTENT_LENGTH = 10000;

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
   * Current initialization request.
   *
   * @type {Promise<Partial<InitializationResult>> | null}
   */
  #initializationPromise;

  /**
   * Whether initialization has completed.
   *
   * @type {boolean}
   */
  #initialized;

  /**
   * Latest initialization result.
   *
   * @type {InitializationResult | null}
   */
  #initializationResults;

  /**
   * Promise for a form mutation update
   *
   * @type {Promise<InitializationResult> | null}
   */
  #formDataUpdatePromise;

  /**
   * Generation of the latest autofill request
   *
   * @type {number}
   */
  #autofillGeneration;

  /**
   * Whether the actor has been destroyed.
   *
   * @type {boolean}
   */
  #destroyed;

  /**
   * Creates the parent actor.
   */
  constructor() {
    super();

    this.#controller = null;
    this.#initializationPromise = null;
    this.#destroyed = false;
    this.#initialized = false;
    this.#initializationResults = null;
    this.#formDataUpdatePromise = null;
    this.#autofillGeneration = 0;
  }

  // NOTE: This is here for testing without the UI entry point
  // During UI integration a form update should invalidate the
  // autofill that's in progress by incrementing the #autofillGeneration.
  // The user's autofill request should then be retried after
  // the latest form updates resolve.
  /**
   * Generates and applies values for the focused form.
   *
   * @returns {Promise<void>}
   */
  async triggerAutofill() {
    await this.#ensureInitialized();

    if (this.#cannotAutofill()) {
      return;
    }

    if (!(await this.#waitForFormDataUpdate())) {
      return;
    }

    const focusedForm = await this.sendQuery(
      "SmartFormFill:GetFocusedForm"
    ).catch(error => {
      if (!this.#destroyed) {
        lazy.console.error("Could not get focused Smart Form Fill form", error);
      }

      return null;
    });

    if (!focusedForm) {
      return;
    }

    const relevantTabs = this.#controller.getRelevantTabsFor(focusedForm.id);

    // TODO: Present the UI to select relevant tabs from list
    // of tabs, up to 5

    // NOTE: this userSelectedTabs would from the user choosing from UI
    const userSelectedTabs = relevantTabs;

    await this.#performAutofill(focusedForm, userSelectedTabs);
  }

  /**
   * Receives messages from the child actor.
   *
   * @param {object} param
   * @param {Array<FormData> | undefined} param.data
   * @param {string} param.name The message type
   *
   * @returns {Promise<boolean> | Promise<Partial<InitializationResult>> |
   * null | undefined}
   */
  receiveMessage({ data, name }) {
    switch (name) {
      case "SmartFormFill:IsSmartWindow":
        return this.#onIsSmartWindow();

      case "SmartFormFill:Initialize":
        return this.#onInitialize(data);

      case "SmartFormFill:FormUpdate":
        return this.#onFormUpdate(data);
    }

    return null;
  }

  /**
   * Destroys controller state.
   */
  didDestroy() {
    this.#destroyed = true;
    this.#resetController();
  }

  /**
   * Triggers the autofill for the focused form with chosen tabs
   *
   * @param {FocusedForm} focusedForm
   * @param {Array<RelevantTab>} selectedTabs
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
   * @param {Array<RelevantTab>} selectedTabs
   * @param {number} textCharLimitPerTab
   *
   * @returns {Promise<Map<string, string>>}
   */
  async #getTabsContent(selectedTabs, textCharLimitPerTab) {
    const tabContentById = new Map();

    const promises = selectedTabs.map(selectedTab => {
      const tabData = this.#controller.getRelevantTabData(selectedTab.id);

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
   * Clears the controller and initialization state
   */
  #resetController() {
    this.#controller?.destroy();
    this.#controller = null;
    this.#initialized = false;
    this.#initializationResults = null;
    this.#initializationPromise = null;
    this.#formDataUpdatePromise = null;
  }

  /**
   * Checks whether autofill can run.
   *
   * @returns {boolean}
   */
  #cannotAutofill() {
    return this.#destroyed || !this.#initialized || !this.#controller;
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
   * Ensures the controller has completed initialization.
   *
   * @returns {Promise<void>}
   */
  async #ensureInitialized() {
    if (this.#initialized) {
      return;
    }

    if (!this.#initializationPromise) {
      const formData = await this.sendQuery("SmartFormFill:GetFormData");
      await this.#onInitialize(formData);
      return;
    }

    await this.#initializationPromise;
  }

  /**
   * Waits for the current form-data update.
   *
   * @returns {Promise<boolean>} Whether autofill may continue
   */
  async #waitForFormDataUpdate() {
    const updatePromise = this.#formDataUpdatePromise;
    if (!updatePromise) {
      return true;
    }

    const updateResult = await updatePromise.catch(error => {
      const isCurrentUpdate = this.#formDataUpdatePromise === updatePromise;
      if (!isCurrentUpdate) {
        return null;
      }

      this.#resetController();

      if (!this.#destroyed) {
        lazy.console.error("Smart Form Fill form update failed", error);
      }

      return null;
    });

    if (this.#formDataUpdatePromise !== updatePromise) {
      return false;
    }

    this.#formDataUpdatePromise = null;

    if (!this.#isInitializationSuccessful(updateResult)) {
      this.#resetController();
      return false;
    }

    return true;
  }

  /**
   * Checks whether all initialization requests completed.
   *
   * @param {InitializationResult | null} result
   *
   * @returns {boolean}
   */
  #isInitializationSuccessful(result) {
    return Boolean(
      result?.relevantTabsCompleted && result?.classificationsCompleted
    );
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
   * Creates a failed initialization result.
   *
   * @returns {InitializationResult}
   */
  #getFailedInitializationResult() {
    return {
      relevantTabsCompleted: false,
      classificationsCompleted: false,
    };
  }

  /**
   * Initializes the controller with form data.
   *
   * @param {Array<FormData>} formDataList
   * @returns {Promise<InitializationResult>}
   */
  async #onInitialize(formDataList) {
    if (!Array.isArray(formDataList)) {
      return this.#getFailedInitializationResult();
    }

    if (this.#initialized) {
      return this.#initializationResults;
    }

    if (this.#initializationPromise) {
      return this.#initializationPromise;
    }

    if (this.#destroyed) {
      return this.#getFailedInitializationResult();
    }

    this.#controller = new lazy.SmartFormFillController(this.#getPageInfo());
    this.#initializationPromise = this.#initializeController(formDataList);

    return this.#initializationPromise;
  }

  /**
   * Initializes the controller and waits for replacement mutation requests.
   *
   * @param {Array<FormData>} formDataList
   * @returns {Promise<InitializationResult>}
   */
  async #initializeController(formDataList) {
    try {
      let initialized = await this.#controller.initialize(formDataList);

      if (this.#destroyed) {
        this.#initialized = false;
        return this.#getFailedInitializationResult();
      }

      while (this.#formDataUpdatePromise) {
        const updatePromise = this.#formDataUpdatePromise;
        initialized = await updatePromise;

        if (this.#formDataUpdatePromise === updatePromise) {
          this.#formDataUpdatePromise = null;
        }
      }

      if (this.#destroyed) {
        this.#initialized = false;

        return this.#getFailedInitializationResult();
      }

      if (!this.#isInitializationSuccessful(initialized)) {
        throw new Error("Smart Form Fill initialization failed");
      }

      this.#initializationResults = initialized;
      this.#initialized = true;

      return initialized;
    } catch (error) {
      this.#resetController();

      throw error;
    }
  }

  /**
   * Message handler for "SmartFormFill:FormUpdate"
   *
   * @param {Array<FormData>} formDataList
   */
  #onFormUpdate(formDataList) {
    if (this.#destroyed || !this.#controller) {
      return;
    }

    this.#formDataUpdatePromise = this.#controller.updateFormData(formDataList);
  }
}
