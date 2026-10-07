/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global RPMAddMessageListener, RPMCanSetDefaultPDFHandler, RPMGetBoolPref,
   RPMPickPDFFile, RPMSendAsyncMessage, RPMSendQuery, RPMSetDefaultPDFHandler,
   RPMSetPref */

const PROMO_DISMISSED_PREF = "browser.aboutpdf.promo.dismissed";

const dropzone = document.getElementById("dropzone");
const dropzoneHint = document.getElementById("dropzone-hint");
const dropzoneError = document.getElementById("dropzone-error");
const browseFiles = document.getElementById("browse-files");
const promo = document.getElementById("promo");
const setDefault = document.getElementById("set-default");
const dismissPromo = document.getElementById("dismiss-promo");
const notification = document.getElementById("pdf-notification");
const featuresCta = document.getElementById("features-cta");
const featuresBack = document.getElementById("features-back");
const mainHeading = document.getElementById("main-heading");
const featuresHeading = document.getElementById("features-heading");

let notificationClaimed = false;
let notificationConsumed = false;

function renderView(moveFocus) {
  const showFeatures = window.location.hash === "#features";
  document.body.classList.toggle("view-features", showFeatures);
  if (showFeatures) {
    consumeNotification();
  }
  updateNotificationVisibility();
  if (moveFocus) {
    (showFeatures ? featuresHeading : mainHeading).focus();
  }
}

window.addEventListener("hashchange", () => renderView(true));

// Add a history entry so Back returns to the main view.
featuresCta.addEventListener("click", () => {
  window.location.hash = "features";
});

featuresBack.addEventListener("click", async () => {
  try {
    if (await RPMSendQuery("AboutPDF:GoBack")) {
      return;
    }
  } catch (e) {
    console.error("Failed to go back", e);
  }
  // With no previous entry, switch views without adding history.
  try {
    window.history.replaceState(
      null,
      "",
      window.location.href.replace(/#.*$/, "")
    );
    renderView(true);
  } catch {
    window.location.hash = "";
  }
});

renderView(false);

browseFiles.addEventListener("click", () => {
  pickFile();
});

dropzone.addEventListener("dragenter", e => {
  e.preventDefault();
  dropzone.classList.add("drag-over");
});

dropzone.addEventListener("dragover", e => {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "copy";
  }
});

dropzone.addEventListener("dragleave", e => {
  if (!dropzone.contains(e.relatedTarget)) {
    dropzone.classList.remove("drag-over");
  }
});

dropzone.addEventListener("drop", e => {
  dropzone.classList.remove("drag-over");
  // Let native handling open .pdf files with a PDF MIME type; cancel others.
  const files = e.dataTransfer?.files;
  if (
    !files?.length ||
    ![...files].every(
      file =>
        file.type === "application/pdf" &&
        file.name.toLowerCase().endsWith(".pdf")
    )
  ) {
    e.preventDefault();
    showError("invalid");
  }
});

// Mouse users can click anywhere in the dropzone; keyboard/AT users go
// through #browse-files which has the real button semantics.
dropzone.addEventListener("click", e => {
  if (!e.target.closest("#browse-files")) {
    pickFile();
  }
});

setDefault.addEventListener("click", async () => {
  setDefault.disabled = true;
  let isDefaultNow = false;
  try {
    isDefaultNow = await RPMSetDefaultPDFHandler();
  } catch (e) {
    console.error("Failed to set Firefox as the default PDF handler", e);
  } finally {
    setDefault.disabled = false;
    // Hide the promo if Firefox is the default now; otherwise re-check (an
    // out-of-process picker the user hasn't finished, or a declined set).
    if (isDefaultNow) {
      promo.hidden = true;
    } else {
      updatePromoVisibility();
    }
  }
});

dismissPromo.addEventListener("click", () => {
  promo.hidden = true;
  RPMSetPref(PROMO_DISMISSED_PREF, true).catch(e => {
    console.error("Failed to persist promo dismissal", e);
  });
});

setupNotification();

updatePromoVisibility();

async function setupNotification() {
  // Move focus before the bar removes itself.
  notification.addEventListener("message-bar:user-dismissed", () => {
    if (notification.matches(":focus-within")) {
      browseFiles.focus();
    }
    persistNotificationDismissal();
  });

  RPMAddMessageListener("PDF:HideFeaturesNotification", () => {
    dropNotification();
  });

  // Do not claim an impression on the features view.
  if (document.body.classList.contains("view-features")) {
    dropNotification();
    return;
  }
  try {
    notificationClaimed = await RPMSendQuery("AboutPDF:NotificationEligible");
  } catch (e) {
    console.error("Failed to check the notification eligibility", e);
  }
  // Another surface may dismiss the notification while the query is pending.
  if (!notificationClaimed || !notification.isConnected) {
    dropNotification();
    return;
  }
  updateNotificationVisibility();
}

function consumeNotification() {
  if (notificationConsumed) {
    return;
  }
  notificationConsumed = true;
  persistNotificationDismissal();
  dropNotification();
}

function persistNotificationDismissal() {
  notificationClaimed = false;
  RPMSendAsyncMessage("AboutPDF:DismissNotification");
}

function updateNotificationVisibility() {
  if (
    notificationClaimed &&
    !document.body.classList.contains("view-features")
  ) {
    notification.hidden = false;
  }
}

// Removal prevents later callbacks from showing it again.
function dropNotification() {
  notificationClaimed = false;
  notification.remove();
}

async function updatePromoVisibility() {
  try {
    if (RPMGetBoolPref(PROMO_DISMISSED_PREF, false)) {
      promo.hidden = true;
      return;
    }
    promo.hidden = !(await RPMCanSetDefaultPDFHandler());
  } catch {
    promo.hidden = true;
  }
}

let processing = false;

// The parent validates the selected file before opening it.
async function pickFile() {
  if (processing) {
    return;
  }
  processing = true;
  showError(null);
  try {
    if ((await RPMPickPDFFile()) === "invalid") {
      showError("invalid");
    }
  } catch (e) {
    console.error("Failed to open PDF file", e);
    showError("generic");
  } finally {
    processing = false;
  }
}

// errorType: null, "invalid" (not a PDF), or "generic".
function showError(errorType) {
  if (!errorType) {
    dropzoneError.hidden = true;
    dropzoneError.removeAttribute("data-l10n-id");
    dropzoneHint.hidden = false;
    return;
  }
  dropzoneError.hidden = false;
  dropzoneError.setAttribute(
    "data-l10n-id",
    errorType === "invalid"
      ? "about-pdf-dropzone-invalid-file"
      : "about-pdf-dropzone-error-generic"
  );
  dropzoneHint.hidden = errorType === "invalid";
}

// Enter opens the picker while the dropzone is hovered and no control has focus.
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && dropzone.matches(":hover")) {
    const active = document.activeElement;
    if (
      !active ||
      active === document.body ||
      active === document.documentElement
    ) {
      e.preventDefault();
      pickFile();
    }
  }
});
