/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { E10SUtils } from "resource://gre/modules/E10SUtils.sys.mjs";
import {
  FORM_REVIEW_READY_EVENT,
  VALID_FORM_REVIEW_ACTIONS,
  VALID_FORM_REVIEW_GENERATION_ERRORS,
} from "chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs";

/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewField} FormReviewField */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewAction} FormReviewAction */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewFillResult} FormReviewFillResult */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewGenerationErrorType} FormReviewGenerationErrorType */

/**
 * @callback FormReviewActionHandler
 * @param {FormReviewAction} action
 * @returns {Promise<FormReviewFillResult | void>}
 */

/**
 * @callback FormReviewDestroyHandler
 * @returns {void}
 */

/**
 * Parent actor for communicating with the form review dialog component
 */
export class SmartFormFillReviewParent extends JSWindowActorParent {
  /** @type {FormReviewActionHandler | null} */
  #actionHandler = null;

  /** @type {FormReviewDestroyHandler | null} */
  #destroyHandler = null;

  /**
   * Connects the dialog shell to actions and lifecycle notifications from the
   * review component.
   *
   * @param {object} handlers
   * @param {FormReviewActionHandler} handlers.onAction
   * @param {FormReviewDestroyHandler} handlers.onDestroy
   * @returns {void}
   */
  connect({ onAction, onDestroy }) {
    this.#assertRemoteType();
    this.#actionHandler = onAction;
    this.#destroyHandler = onDestroy;
  }

  /**
   * Removes the dialog shell's action and lifecycle handlers.
   *
   * @returns {void}
   */
  disconnect() {
    this.#actionHandler = null;
    this.#destroyHandler = null;
  }

  /**
   * Initializes the review component in progress state while values
   * are generated for the form.
   *
   * @returns {Promise<boolean>}
   *   Whether the review component was initialized.
   */
  initialize() {
    this.#assertRemoteType();
    return this.sendQuery("SmartFormFillReview:Initialize");
  }

  /**
   * Sends generated values to the review component.
   *
   * @param {Array<FormReviewField>} fields
   *   Generated values and field metadata to present for review.
   * @returns {Promise<boolean>}
   *   Whether the review component displayed the suggestions.
   */
  showSuggestions(fields) {
    this.#assertRemoteType();
    return this.sendQuery("SmartFormFillReview:ShowSuggestions", { fields });
  }

  /**
   * Displays a generation failure in the review component.
   *
   * @param {FormReviewGenerationErrorType} errorType
   *   The generation failure reason.
   * @returns {Promise<boolean>}
   *   Whether the review component displayed the error.
   */
  showGenerationError(errorType) {
    this.#assertRemoteType();
    if (!VALID_FORM_REVIEW_GENERATION_ERRORS.includes(errorType)) {
      return Promise.resolve(false);
    }

    return this.sendQuery("SmartFormFillReview:ShowGenerationError", {
      errorType,
    });
  }

  /**
   * Forwards component readiness or a validated review action to the dialog shell.
   *
   * @param {
   *   {
   *     name: "SmartFormFillReview:Ready",
   *     data?: undefined
   *   } |
   *   {
   *     name: "SmartFormFillReview:Action",
   *     data: FormReviewAction
   *   }
   * } message
   *   The message received from the review child actor.
   *
   * @returns {Promise<FormReviewFillResult | void> | undefined}
   *   The action result, or undefined for readiness or a disconnected dialog.
   */
  receiveMessage({ name, data }) {
    this.#assertRemoteType();

    if (name === FORM_REVIEW_READY_EVENT) {
      this.#notifyReady();
      return undefined;
    }

    const actionType = data?.type;
    if (
      name !== "SmartFormFillReview:Action" ||
      !VALID_FORM_REVIEW_ACTIONS.includes(actionType)
    ) {
      throw new Error(`Unexpected Smart Form Fill review message: ${name}`);
    }

    if (!this.#actionHandler) {
      return undefined;
    }

    return this.#actionHandler(data);
  }

  /**
   * Notifies the dialog shell that the review component is ready.
   *
   * @returns {void}
   */
  #notifyReady() {
    const browser = this.browsingContext.embedderElement;
    const chromeWindow = browser?.documentGlobal;
    if (!browser || !chromeWindow) {
      return;
    }

    browser.dispatchEvent(
      new chromeWindow.CustomEvent(FORM_REVIEW_READY_EVENT)
    );
  }

  /**
   * Notifies the dialog shell that the review document was destroyed.
   *
   * @returns {void}
   */
  didDestroy() {
    const destroyHandler = this.#destroyHandler;
    this.disconnect();

    if (destroyHandler) {
      destroyHandler();
    }
  }

  /**
   * Verifies that review messages originate from the expected process.
   *
   * @returns {void}
   * @throws {Error} If the actor is running in an unexpected remote process.
   */
  #assertRemoteType() {
    if (
      !this.manager.isInProcess &&
      this.manager.remoteType !== E10SUtils.PRIVILEGEDABOUT_REMOTE_TYPE
    ) {
      throw new Error(
        "Smart Form Fill review messages must come from a privilegedabout process."
      );
    }
  }
}
