/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { FORM_REVIEW_ACTIONS } from "chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs";

/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewAction} FormReviewAction */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewFillResult} FormReviewFillResult */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewGenerationResult} FormReviewGenerationResult */

/**
 * @callback FormReviewFillHandler
 * @param {Array<{id: string, value: string}>} fields
 *   The reviewed fields approved for filling.
 * @returns {Promise<FormReviewFillResult>} The result of filling the fields.
 */

const FORM_REVIEW_URL =
  "chrome://browser/content/aiwindow/smartformfill-form-review.html";

/**
 * Manages one form-review dialog and its generation-result contract.
 */
export class SmartFormFillReviewSession {
  /** @type {MozBrowser} */
  #browser;

  /** @type {Window} */
  #chromeWindow;

  /** @type {object | null} */
  #dialog = null;

  /** @type {boolean} */
  #closed = false;

  /** @type {boolean} */
  #generationPending = true;

  /** @type {Set<string>} */
  #generatedFieldIds = new Set();

  #generationResult = Promise.withResolvers();

  #ready = Promise.withResolvers();

  /** @type {() => void} */
  #onCancelGeneration;

  /** @type {(session: SmartFormFillReviewSession) => void} */
  #onClose;

  /** @type {FormReviewFillHandler} */
  #onFill;

  /**
   * Creates a form-review session.
   *
   * @param {object} options
   * @param {MozBrowser} options.browser
   *   The browser containing the form being filled.
   * @param {Window} options.chromeWindow
   *   The browser chrome window that owns the TabDialogBox.
   * @param {() => void} options.onCancelGeneration
   *   Called when pending value generation should be cancelled.
   * @param {(session: SmartFormFillReviewSession) => void} options.onClose
   *   Called after the review dialog closes.
   * @param {FormReviewFillHandler} options.onFill
   *   Called with reviewed values approved for filling.
   */
  constructor({ browser, chromeWindow, onCancelGeneration, onClose, onFill }) {
    this.#browser = browser;
    this.#chromeWindow = chromeWindow;
    this.#onCancelGeneration = onCancelGeneration;
    this.#onClose = onClose;
    this.#onFill = onFill;
  }

  /**
   * Whether the session is waiting for generated values.
   *
   * @returns {boolean} Whether value generation is pending.
   */
  get generationPending() {
    return this.#generationPending;
  }

  /**
   * Opens the form-review dialog and waits for its isolated UI to initialize.
   *
   * @returns {Promise<boolean>}
   *   Whether the review UI initialized successfully.
   */
  async open() {
    if (this.#closed || this.#dialog) {
      return false;
    }

    const dialogArguments = {
      generationResult: this.#generationResult.promise,
      onReady: () => this.#ready.resolve(true),
      onAction: action => this.#handleAction(action),
    };
    const { dialog, closedPromise } = this.#chromeWindow.gBrowser
      .getTabDialogBox(this.#browser)
      .open(
        FORM_REVIEW_URL,
        {
          features: "resizable=no",
          allowDuplicateDialogs: false,
        },
        dialogArguments
      );

    if (!dialog) {
      this.#closed = true;
      return false;
    }

    this.#dialog = dialog;
    this.#waitForClose(dialog, closedPromise);
    return this.#ready.promise;
  }

  /**
   * Supplies generated suggestions or a generation error to the dialog.
   *
   * @param {FormReviewGenerationResult} result The completed generation result.
   *
   * @returns {boolean} Whether the result was accepted by the session.
   */
  completeGeneration(result) {
    if (this.#closed || !this.#generationPending) {
      return false;
    }

    this.#generationPending = false;

    if (Array.isArray(result.fields)) {
      for (const { id } of result.fields) {
        this.#generatedFieldIds.add(id);
      }
    }

    this.#generationResult.resolve(result);
    return true;
  }

  /**
   * Cancels pending generation and closes the dialog.
   *
   * @returns {void}
   */
  abort() {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#cancelGeneration();
    this.#dialog?.abort();
  }

  /**
   * Validates and handles an action from the review dialog.
   *
   * @param {FormReviewAction} action The action received from the dialog.
   *
   * @returns {Promise<FormReviewFillResult>} The action result.
   */
  async #handleAction(action) {
    if (action.type === FORM_REVIEW_ACTIONS.STOP) {
      this.#cancelGeneration();
      return {
        hasErrors: false,
        cancelled: true,
        filledFieldCount: 0,
      };
    }

    if (
      this.#closed ||
      action.type !== FORM_REVIEW_ACTIONS.FILL_FORM ||
      !Array.isArray(action.fields)
    ) {
      return {
        hasErrors: true,
        cancelled: false,
        filledFieldCount: 0,
      };
    }

    const fields = action.fields.filter(
      ({ id, value }) =>
        this.#generatedFieldIds.has(id) && typeof value === "string"
    );

    return this.#onFill(fields);
  }

  /**
   * Cancels value generation once for this session.
   *
   * @returns {void}
   */
  #cancelGeneration() {
    if (!this.#generationPending) {
      return;
    }

    this.#generationPending = false;
    this.#onCancelGeneration();
    this.#generationResult.reject(
      new DOMException("Generation cancelled", "AbortError")
    );
  }

  /**
   * Handles final session cleanup after the dialog closes.
   *
   * @param {object} dialog The opened TabDialogBox dialog.
   * @param {Promise<void>} closedPromise Resolves when the dialog closes.
   *
   * @returns {Promise<void>}
   */
  async #waitForClose(dialog, closedPromise) {
    try {
      await closedPromise;
    } finally {
      this.#ready.resolve(false);
      this.#cancelGeneration();
      this.#closed = true;

      if (this.#dialog === dialog) {
        this.#dialog = null;
      }

      this.#onClose(this);
    }
  }
}
