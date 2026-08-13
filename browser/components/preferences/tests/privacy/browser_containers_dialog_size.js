/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const CONTAINERS_URL =
  "chrome://browser/content/preferences/dialogs/containers.xhtml";

add_setup(async function () {
  await openPreferencesViaOpenPreferencesAPI("containers", { leaveOpen: true });
  registerCleanupFunction(async function () {
    BrowserTestUtils.removeTab(gBrowser.selectedTab);
  });
});

function openDialog() {
  let doc = gBrowser.selectedBrowser.contentDocument;
  let dialogPromise = promiseLoadSubDialog(CONTAINERS_URL);
  doc.getElementById("containers-add-button").click();
  return dialogPromise;
}

async function closeDialog(win) {
  let closed = BrowserTestUtils.waitForEvent(
    gBrowser.selectedBrowser.contentWindow,
    "dialogclose"
  );
  win.document.querySelector("dialog").getButton("cancel").click();
  await closed;
}

// Without this an empty or unrendered form would trivially "fit" and the
// assertions below would pass vacuously.
function assertFormRendered(win, label) {
  let nameInput = win.document.querySelector("moz-input-text[name=name]");
  Assert.ok(nameInput, `${label}: the name input is present`);
  Assert.greater(
    nameInput.getBoundingClientRect().height,
    0,
    `${label}: the name input has been laid out`
  );

  let swatches = win.document.querySelectorAll("moz-visual-picker-item");
  Assert.equal(
    swatches.length,
    ContextualIdentityService.containerColors.length +
      ContextualIdentityService.containerIcons.length,
    `${label}: every color and icon swatch is present`
  );
  Assert.greater(
    swatches[0].getBoundingClientRect().height,
    0,
    `${label}: the swatches have been laid out`
  );
}

// With a non-integer scaling factor the measured heights and innerHeight can
// disagree by a fraction of a CSS pixel; the regression crops by much more.
const MAX_ROUNDING_ERROR_PX = 1;

function assertFits(win, label) {
  let dialog = win.document.querySelector("dialog");
  let acceptButton = dialog.getButton("accept");
  let cancelButton = dialog.getButton("cancel");
  let maxHeight = win.innerHeight + MAX_ROUNDING_ERROR_PX;

  for (let [name, button] of [
    ["accept", acceptButton],
    ["cancel", cancelButton],
  ]) {
    Assert.lessOrEqual(
      button.getBoundingClientRect().bottom,
      maxHeight,
      `${label}: the ${name} button is fully visible`
    );
  }

  Assert.lessOrEqual(
    win.document.documentElement.scrollHeight,
    maxHeight,
    `${label}: the dialog contents are not clipped`
  );
}

// SubDialog measures the content's scrollHeight once it is ready. On the first
// open the l10n resources still have to be loaded, and that wait used to hide
// the race; on the following opens they are cached, so the measurement happened
// before the form was localized and laid out. See bug 2057680.
add_task(async function test_dialog_is_not_cropped_on_reopen() {
  for (let i = 1; i <= 3; ++i) {
    let win = await openDialog();
    assertFormRendered(win, `open #${i}`);
    assertFits(win, `open #${i}`);
    await closeDialog(win);
  }
});
