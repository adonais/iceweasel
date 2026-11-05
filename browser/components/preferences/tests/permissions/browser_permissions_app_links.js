/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SITE_PERMISSIONS_URL =
  "chrome://browser/content/preferences/dialogs/sitePermissions.xhtml";
const PERM = "register-protocol-handler";
const DEFAULT_PREF = "permissions.default." + PERM;

const principal =
  Services.scriptSecurityManager.createContentPrincipalFromOrigin(
    "https://example.com"
  );

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(DEFAULT_PREF);
  SitePermissions.removeFromPrincipal(principal, PERM);
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

async function openBlockedSitesDialog(doc) {
  let dialogOpened = promiseLoadSubDialog(SITE_PERMISSIONS_URL);
  doc.getElementById("registerProtocolHandlerSettingsButton").click();
  let dialog = await dialogOpened;
  await dialog.document.mozSubdialogReady;
  return dialog;
}

async function acceptDialog(dialog) {
  let closing = BrowserTestUtils.waitForEvent(dialog, "dialogclosing", true);
  dialog.document.querySelector("dialog").getButton("accept").click();
  await closing;
}

function waitForButtonDisabled(button, disabled) {
  return BrowserTestUtils.waitForMutationCondition(
    button.buttonEl,
    { attributes: true, attributeFilter: ["disabled"] },
    () => button.buttonEl.disabled == disabled
  );
}

add_task(async function testAllowCheckbox() {
  await openPermissionsPane({ leaveOpen: true });
  let doc = gBrowser.contentDocument;
  let checkbox = doc.getElementById("allowAppLinkRequests").control.controlEl;
  let button = doc.getElementById("registerProtocolHandlerSettingsButton")
    .control.controlEl;

  ok(checkbox.checked, "Sites may ask by default.");
  ok(!button.buttonEl.disabled, "Blocked sites can be managed by default.");

  checkbox.click();
  await waitForButtonDisabled(button, true);
  is(
    Services.prefs.getIntPref(DEFAULT_PREF),
    SitePermissions.BLOCK,
    "Unchecking the box blocks all sites from asking."
  );

  checkbox.click();
  await waitForButtonDisabled(button, false);
  is(
    Services.prefs.getIntPref(DEFAULT_PREF),
    SitePermissions.UNKNOWN,
    "Checking the box lets sites ask again."
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function testManageBlockedSites() {
  SitePermissions.setForPrincipal(principal, PERM, SitePermissions.BLOCK);

  await openPermissionsPane({ leaveOpen: true });
  let dialog = await openBlockedSitesDialog(gBrowser.contentDocument);
  let dialogDoc = dialog.document;
  ok(
    BrowserTestUtils.isHidden(
      dialogDoc.getElementById("permissionsDisableCheckbox")
    ),
    "The dialog has no block-all checkbox of its own."
  );

  let richlistbox = dialogDoc.getElementById("permissionsBox");
  is(richlistbox.itemCount, 1, "The blocked site is listed.");
  let removeButton = dialogDoc.getElementById("removePermission");
  EventUtils.synthesizeMouseAtCenter(richlistbox.getItemAtIndex(0), {}, dialog);
  await BrowserTestUtils.waitForMutationCondition(
    removeButton,
    { attributes: true, attributeFilter: ["disabled"] },
    () => !removeButton.disabled
  );
  removeButton.click();
  await BrowserTestUtils.waitForMutationCondition(
    richlistbox,
    { childList: true },
    () => richlistbox.itemCount == 0
  );
  await acceptDialog(dialog);

  is(
    SitePermissions.getForPrincipal(principal, PERM).state,
    SitePermissions.UNKNOWN,
    "Removing the site from the list lets it ask again."
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
