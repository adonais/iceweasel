/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "console", function () {
  return console.createInstance({ prefix: "SmartFormFillChild" });
});

ChromeUtils.defineESModuleGetters(lazy, {
  SmartFormFillDocument:
    "moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillDocument.sys.mjs",
});

/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillController.sys.mjs").FillFormResult} FillFormResult */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillDocument.sys.mjs").SmartFormFillDocument} SmartFormFillDocument */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillDocument.sys.mjs").FormData} FormData */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillDocument.sys.mjs").FocusedForm} FocusedForm */

/**
 * @typedef {{
 *   data: FillFormResult,
 *   name: "SmartFormFill:FillForm",
 * } |
 * {
 *  data?: undefined,
 *  name: "SmartFormFill:GetFocusedForm"
 * } |
 * {
 *  data?: undefined,
 *  name: "SmartFormFill:GetFormData"
 * }} SmartFormFillMessage
 */

/**
 * Child actor for Smart Form Fill.
 */
export class SmartFormFillChild extends JSWindowActorChild {
  /**
   * Document manager for the current page.
   *
   * @type {SmartFormFillDocument | null}
   */
  #smartFormFillDocument = null;

  /**
   * Whether the actor has been destroyed.
   *
   * @type {boolean}
   */
  #destroyed = false;

  /**
   * Current document initialization request.
   *
   * @type {Promise<void> | null}
   */
  #initializationPromise = null;

  /**
   * Ensures the child actor gets initialized
   */
  actorCreated() {
    if (this.document.readyState !== "loading") {
      this.#ensureInitialized();
    }
  }

  /**
   * Initializes Smart Form Fill after the document loads.
   *
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async handleEvent(event) {
    if (event.type !== "DOMContentLoaded") {
      return;
    }

    await this.#ensureInitialized();
  }

  /**
   * Ensures document initialization has completed.
   *
   * @returns {Promise<void>}
   */
  #ensureInitialized() {
    if (this.#initializationPromise) {
      return this.#initializationPromise;
    }

    if (this.#smartFormFillDocument || this.#destroyed) {
      return Promise.resolve();
    }

    const initializationPromise = this.#initializeDocument()
      .catch(error => {
        this.#smartFormFillDocument?.destroy();
        this.#smartFormFillDocument = null;

        if (!this.#destroyed) {
          lazy.console.error("Smart Form Fill initialization failed", error);
        }
      })
      .finally(() => {
        if (this.#initializationPromise === initializationPromise) {
          this.#initializationPromise = null;
        }
      });

    this.#initializationPromise = initializationPromise;
    return initializationPromise;
  }

  /**
   * Initializes Smart Form Fill for the current document.
   *
   * @returns {Promise<void>}
   */
  async #initializeDocument() {
    if (this.#destroyed) {
      return;
    }

    const isSmartWindow = await this.sendQuery(
      "SmartFormFill:IsSmartWindow"
    ).catch(error => {
      if (!this.#destroyed) {
        lazy.console.error("Could not determine if in Smart Window", error);
      }

      return false;
    });

    if (!isSmartWindow || this.#destroyed) {
      return;
    }

    this.#smartFormFillDocument = new lazy.SmartFormFillDocument(this.document);
    await this.#smartFormFillDocument.initialize(this.#onFormUpdate.bind(this));

    if (this.#destroyed) {
      return;
    }

    await this.sendQuery(
      "SmartFormFill:Initialize",
      this.#smartFormFillDocument.getFormData()
    ).catch(error => {
      if (!this.#destroyed) {
        lazy.console.error("Smart Form Fill initialization failed", error);
      }
    });
  }

  /**
   * Forwards parent messages to the document manager.
   *
   * @param {SmartFormFillMessage} message
   * @returns {Promise<FocusedForm | Array<FormData> | null |
   * undefined>}
   */
  async receiveMessage({ data, name }) {
    if (
      !this.#smartFormFillDocument &&
      this.document.readyState !== "loading"
    ) {
      await this.#ensureInitialized();
    }

    if (!this.#smartFormFillDocument) {
      return null;
    }

    switch (name) {
      case "SmartFormFill:FillForm":
        this.#smartFormFillDocument.fillForm(data);
        return undefined;

      case "SmartFormFill:GetFocusedForm":
        return this.#smartFormFillDocument.getFocusedForm();

      case "SmartFormFill:GetFormData":
        return this.#smartFormFillDocument.getFormData();
    }

    return null;
  }

  /**
   * Destroys document state.
   */
  didDestroy() {
    this.#smartFormFillDocument?.destroy();
    this.#smartFormFillDocument = null;
    this.#initializationPromise = null;
    this.#destroyed = true;
  }

  /**
   * Callback for SmartFormFillDocument to use when it
   * detects a form update
   *
   * @param {Array<FormData>} formDataList
   */
  #onFormUpdate(formDataList) {
    if (!formDataList || this.#destroyed) {
      return;
    }

    this.sendAsyncMessage("SmartFormFill:FormUpdate", formDataList);
  }
}
