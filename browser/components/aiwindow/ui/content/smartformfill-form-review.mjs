/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  FORM_REVIEW_ACTIONS,
  FORM_REVIEW_READY_EVENT,
} from "chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs";

/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewField} FormReviewField */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewAction} FormReviewAction */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewActionType} FormReviewActionType */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewFillResult} FormReviewFillResult */
/** @typedef {import("chrome://browser/content/aiwindow/modules/SmartFormFillConstants.mjs").FormReviewGenerationResult} FormReviewGenerationResult */
/** @typedef {import("moz-src:///browser/components/aiwindow/ui/actors/SmartFormFillReviewParent.sys.mjs").SmartFormFillReviewParent} SmartFormFillReviewParent */

/**
 * @callback FormReviewActionHandler
 * @param {FormReviewAction} action
 * @returns {Promise<FormReviewFillResult>}
 */

/**
 * Trusted contract passed from SmartFormFillParent to the dialog shell.
 *
 * @typedef {object} FormReviewDialogArguments
 * @property {Promise<FormReviewGenerationResult>} generationResult Promise for
 *    the form's result
 * @property {() => void} onReady Callback to indicate review dialog is
 *    ready/initialized
 * @property {FormReviewActionHandler} onAction Callback to handle user
 *    interactions
 */

const REVIEW_URL = "about:smartformfillreview";

const dialogBrowser = /** @type {MozBrowser} */ (
  window.docShell.chromeEventHandler
);
const dialogBox = /** @type {HTMLElement} */ (
  dialogBrowser.closest(".dialogBox")
);
const dialogArguments = /** @type {FormReviewDialogArguments} */ (
  window.arguments[0]
);
const container = /** @type {HTMLElement} */ (
  document.querySelector("#form-review-browser-container")
);

/** @type {SmartFormFillReviewParent | undefined} */
let reviewActor;
let closing = false;

dialogBox.classList.add("spotlightBox");
dialogBox.setAttribute("sizeto", "available");
dialogBox.setAttribute("fixedsize", "false");

/**
 * Closes the dialog.
 *
 * @returns {void}
 */
function closeDialog() {
  if (closing) {
    return;
  }

  closing = true;
  window.close();
}

/**
 * Forwards actions from the review document to SmartFormFillParent.
 *
 * @param {FormReviewAction} action The validated review action.
 *
 * @returns {Promise<FormReviewFillResult | void>}
 */
async function handleAction(action) {
  switch (action.type) {
    case FORM_REVIEW_ACTIONS.FILL_FORM:
      return dialogArguments.onAction?.(action);

    case FORM_REVIEW_ACTIONS.STOP:
      try {
        await dialogArguments.onAction?.(action);
      } finally {
        closeDialog();
      }
      return undefined;

    case FORM_REVIEW_ACTIONS.CANCEL:
    case FORM_REVIEW_ACTIONS.CLOSE:
      closeDialog();
      return undefined;
  }

  return undefined;
}

/**
 * Displays generated suggestions or their failure after generation completes.
 *
 * @returns {Promise<void>}
 */
async function showGenerationResult() {
  const result = await dialogArguments.generationResult;
  if (closing || !reviewActor) {
    return;
  }

  const displayed = Array.isArray(result?.fields)
    ? await reviewActor.showSuggestions(result.fields)
    : await reviewActor.showGenerationError(result?.errorType);

  if (!displayed) {
    closeDialog();
  }
}

/**
 * Closes the dialog without filling when Escape is pressed.
 *
 * @param {KeyboardEvent} event The key event to handle.
 *
 * @returns {void}
 */
function handleKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeDialog();
  }
}

/**
 * Creates the remote browser that isolates generated values from page content.
 *
 * @returns {MozBrowser} The privileged-about browser.
 */
function createReviewBrowser() {
  const browser = document.createXULElement("browser");
  browser.id = "form-review-browser";
  browser.setAttribute("type", "content");
  browser.setAttribute("flex", "1");
  browser.setAttribute("remote", "true");
  browser.setAttribute("remoteType", "privilegedabout");
  browser.setAttribute("maychangeremoteness", "true");
  browser.setAttribute("disableglobalhistory", "true");
  browser.setAttribute("transparent", "true");
  browser.setAttribute("src", REVIEW_URL);

  return browser;
}

/**
 * Loads the isolated review document and connects its actor to the shell.
 *
 * @returns {Promise<void>}
 */
async function initialize() {
  const reviewBrowser = createReviewBrowser();
  const ready = new Promise(resolve => {
    reviewBrowser.addEventListener(FORM_REVIEW_READY_EVENT, resolve, {
      once: true,
    });
  });

  container.append(reviewBrowser);
  await ready;

  if (reviewBrowser.currentURI.spec !== REVIEW_URL) {
    closeDialog();
    return;
  }

  reviewActor = reviewBrowser.browsingContext.currentWindowGlobal.getActor(
    "SmartFormFillReview"
  );
  reviewActor.connect({
    onAction: handleAction,
    onDestroy: closeDialog,
  });

  const initialized = await reviewActor.initialize();
  if (!initialized) {
    closeDialog();
    return;
  }

  dialogArguments.onReady?.();
  showGenerationResult().catch(error => {
    if (!closing) {
      console.error(
        "Could not update Smart Form Fill review generation result",
        error
      );
      closeDialog();
    }
  });
}

addEventListener("keydown", handleKeydown, true);

addEventListener(
  "pagehide",
  () => {
    closing = true;

    if (reviewActor) {
      reviewActor.disconnect();
      reviewActor = null;
    }

    dialogBox.classList.remove("spotlightBox");
    dialogBox.removeAttribute("sizeto");
    dialogBox.removeAttribute("fixedsize");

    removeEventListener("keydown", handleKeydown, true);
  },
  { once: true }
);

document.mozSubdialogReady = initialize().catch(error => {
  console.error("Could not initialize Smart Form Fill review", error);
  closeDialog();
});
