/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  FORM_REVIEW_ACTIONS,
  FORM_REVIEW_ERRORS,
  FORM_REVIEW_READY_EVENT,
  FORM_REVIEW_STATES,
  VALID_FORM_REVIEW_ACTIONS,
  VALID_FORM_REVIEW_GENERATION_ERRORS,
} from "chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs";

/** @typedef {import("chrome://browser/content/aiwindow/components/ai-sff-form-review.mjs").AiSffFormReview} AiSffFormReview */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewField} FormReviewField */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewAction} FormReviewAction */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewFillResult} FormReviewFillResult */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewErrorType} FormReviewErrorType */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewGenerationErrorType} FormReviewGenerationErrorType */

/**
 * Smart Form Fill review dialog child actor
 */
export class SmartFormFillReviewChild extends JSWindowActorChild {
  /** @type {boolean} */
  #destroyed = false;

  /** @type {boolean} */
  #fillPending = false;

  /**
   * Starts listening for Escape after the child actor is created.
   *
   * @returns {void}
   */
  actorCreated() {
    this.contentWindow.addEventListener("keydown", this, true);
  }

  /**
   * Mark actor as destroyed to prevent any additional interactions.
   *
   * @returns {void}
   */
  didDestroy() {
    this.#destroyed = true;
  }

  /**
   * Handles messages from the parent actor to update the state
   * of the review dialog
   *
   * @param {
   *   {
   *     name: "SmartFormFillReview:Initialize",
   *     data?: undefined
   *   } |
   *   {
   *     name: "SmartFormFillReview:ShowSuggestions",
   *     data: {fields: Array<FormReviewField>}
   *   } |
   *   {
   *     name: "SmartFormFillReview:ShowGenerationError",
   *     data: {errorType: FormReviewGenerationErrorType}
   *   }
   * } message The message from the parent actor.
   *
   * @returns {Promise<boolean>}
   *   Whether the review component accepted the update.
   */
  async receiveMessage({ name, data }) {
    const review = this.#getReview();
    if (!review) {
      return false;
    }

    switch (name) {
      case "SmartFormFillReview:Initialize":
        review.fields = Cu.cloneInto([], this.contentWindow);
        review.errorType = null;
        review.filledFieldCount = null;
        review.filling = false;
        review.state = FORM_REVIEW_STATES.PROGRESS;
        break;

      case "SmartFormFillReview:ShowSuggestions":
        if (!Array.isArray(data?.fields)) {
          return false;
        }
        review.fields = Cu.cloneInto(data.fields, this.contentWindow);
        review.errorType = null;
        review.filledFieldCount = null;
        review.filling = false;
        review.state = FORM_REVIEW_STATES.REVIEW;
        break;

      case "SmartFormFillReview:ShowGenerationError":
        if (!VALID_FORM_REVIEW_GENERATION_ERRORS.includes(data?.errorType)) {
          return false;
        }
        review.errorType = data.errorType;
        review.filledFieldCount = null;
        review.filling = false;
        review.state = FORM_REVIEW_STATES.FINAL;
        break;

      default:
        throw new Error(`Unexpected Smart Form Fill review message: ${name}`);
    }

    await review.updateComplete;
    return true;
  }

  /**
   * Handles component readiness, user actions, and Escape key presses.
   *
   * @param {CustomEvent | KeyboardEvent} event
   *   The component lifecycle event, action, or keyboard event to handle.
   * @returns {void}
   */
  handleEvent(event) {
    if (event.type === "keydown") {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();

        if (!this.#fillPending) {
          this.#sendAction({ type: FORM_REVIEW_ACTIONS.CANCEL });
        }
      }

      return;
    }

    if (event.type === FORM_REVIEW_READY_EVENT) {
      this.sendAsyncMessage(FORM_REVIEW_READY_EVENT);
      return;
    }

    if (!VALID_FORM_REVIEW_ACTIONS.includes(event.type)) {
      return;
    }

    const action = /** @type {FormReviewAction} */ ({
      type: event.type,
    });

    if (event.type === FORM_REVIEW_ACTIONS.FILL_FORM) {
      if (!event.detail || !Array.isArray(event.detail.fields)) {
        return;
      }

      action.fields = event.detail.fields
        .filter(
          field =>
            typeof field.id === "string" && typeof field.value === "string"
        )
        .map(({ id, value }) => ({ id, value }));
    }

    this.#sendAction(action);
  }

  /**
   * Sends a validated user action to the parent actor
   *
   * @param {FormReviewAction} action The user action to send.
   * @returns {void}
   */
  #sendAction(action) {
    if (this.#fillPending) {
      return;
    }

    if (action.type !== FORM_REVIEW_ACTIONS.FILL_FORM) {
      this.sendAsyncMessage("SmartFormFillReview:Action", action);
      return;
    }

    this.#sendFillAction(action);
  }

  /**
   * Sends reviewed values to be filled and displays the operation result.
   *
   * @param {FormReviewAction} action The fill action to send.
   *
   * @returns {Promise<void>}
   */
  async #sendFillAction(action) {
    this.#fillPending = true;

    /** @type {FormReviewFillResult | undefined} */
    let result;

    try {
      result = await this.sendQuery("SmartFormFillReview:Action", action);
    } catch {
      if (!this.#destroyed) {
        this.#showResult(FORM_REVIEW_ERRORS.FILL_FAILED);
      }
      return;
    }

    if (this.#destroyed) {
      return;
    }

    if (result?.cancelled) {
      this.#fillPending = false;
      this.#sendAction({ type: FORM_REVIEW_ACTIONS.CANCEL });
      return;
    }

    const errorType =
      result && !result.hasErrors ? null : FORM_REVIEW_ERRORS.FILL_FAILED;
    const filledFieldCount = result?.filledFieldCount ?? null;

    this.#showResult(errorType, filledFieldCount);
  }

  /**
   * Displays the final success or failure state.
   *
   * @param {FormReviewErrorType | null} errorType
   *   The fill failure reason, or null when filling succeeded.
   * @param {number | null} [filledFieldCount]
   *   The number of fields successfully filled.
   * @returns {void}
   */
  #showResult(errorType, filledFieldCount = null) {
    if (this.#destroyed) {
      return;
    }

    const review = this.#getReview();
    if (!review) {
      return;
    }

    this.#fillPending = false;
    review.filling = false;
    review.errorType = errorType;
    review.filledFieldCount = filledFieldCount;
    review.state = FORM_REVIEW_STATES.FINAL;
  }

  /**
   * Gets the review component from the dialog document.
   *
   * @returns {AiSffFormReview | null}
   *   The unwrapped review component, if it is present.
   */
  #getReview() {
    const review = this.document.querySelector("ai-sff-form-review");
    return review ? Cu.waiveXrays(review) : null;
  }
}
