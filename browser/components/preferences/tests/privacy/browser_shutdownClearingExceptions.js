/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests for the new "Manage Exceptions…" button added by Bug 1767271.
 * Only the patch-specific concerns are covered here:
 *   1. The button is rendered in custom history mode.
 *   2. Its enabled state follows the privacy.sanitize.sanitizeOnShutdown pref.
 *   3. Clicking it opens the permissions sub-dialog wired for
 *      "persist-data-on-shutdown" (not e.g. cookie exceptions).
 *
 * Generic permissions-dialog behaviour (add/save/cancel/remove) is owned by
 * the existing tests under preferences/tests/etp/.
 */

"use strict";

const PERMISSIONS_URL =
  "chrome://browser/content/preferences/dialogs/permissions.xhtml";

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("privacy.history.custom");
  Services.prefs.clearUserPref("privacy.sanitize.sanitizeOnShutdown");
});

async function openPrivacyPaneInCustomMode() {
  Services.prefs.setBoolPref("privacy.history.custom", true);
  await openPreferencesViaOpenPreferencesAPI("panePrivacy", {
    leaveOpen: true,
  });
  return gBrowser.contentDocument;
}

add_task(async function buttonReflectsSanitizeOnShutdownPref() {
  Services.prefs.setBoolPref("privacy.sanitize.sanitizeOnShutdown", true);
  let doc = await openPrivacyPaneInCustomMode();

  let button = doc.getElementById("shutdownClearingExceptions");
  ok(button, "shutdownClearingExceptions button is rendered in custom mode");

  await BrowserTestUtils.waitForMutationCondition(
    button,
    { attributeFilter: ["disabled"] },
    () => !button.disabled
  );
  ok(!button.disabled, "Button is enabled while sanitizeOnShutdown is true");

  Services.prefs.setBoolPref("privacy.sanitize.sanitizeOnShutdown", false);
  await BrowserTestUtils.waitForMutationCondition(
    button,
    { attributeFilter: ["disabled"] },
    () => button.disabled
  );
  ok(button.disabled, "Button becomes disabled when sanitizeOnShutdown is off");

  Services.prefs.setBoolPref("privacy.sanitize.sanitizeOnShutdown", true);
  await BrowserTestUtils.waitForMutationCondition(
    button,
    { attributeFilter: ["disabled"] },
    () => !button.disabled
  );
  ok(!button.disabled, "Button re-enables when sanitizeOnShutdown is back on");

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function buttonOpensPermissionsDialogForCorrectType() {
  Services.prefs.setBoolPref("privacy.sanitize.sanitizeOnShutdown", true);
  let doc = await openPrivacyPaneInCustomMode();

  let button = doc.getElementById("shutdownClearingExceptions");
  await BrowserTestUtils.waitForMutationCondition(
    button,
    { attributeFilter: ["disabled"] },
    () => !button.disabled
  );

  let dialogPromise = promiseLoadSubDialog(PERMISSIONS_URL);
  button.click();
  let dialog = await dialogPromise;

  is(
    dialog.document.documentElement.getAttribute("data-l10n-id"),
    "permissions-exceptions-shutdown-clearing-window",
    "Dialog was opened for the persist-data-on-shutdown permission type"
  );

  dialog.document.querySelector("dialog").getButton("cancel").click();
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
