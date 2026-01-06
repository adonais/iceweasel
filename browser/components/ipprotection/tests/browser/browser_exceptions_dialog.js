/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPExceptionsManager } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPExceptionsManager.sys.mjs"
);

const MODE_PREF = "browser.ipProtection.exceptionsMode";
const ALL_MODE = "all";
const SELECT_MODE = "select";
const ONBOARDING_MESSAGE_MASK_PREF =
  "browser.ipProtection.onboardingMessageMask";

const PERM_NAME = "ipp-vpn";

/**
 * Opens the ipp-vpn permission dialog with a set capabilityFilter.
 *
 * @param {Browser} browser
 *  The current browser instance.
 * @param {1 | 2} capabilityFilter
 *  Ci.nsIPermissionManager.DENY_ACTION or Ci.nsIPermissionManager.ALLOW_ACTION
 * @returns {Window} The dialog window.
 */
async function openDialog(browser, capabilityFilter) {
  let params = {
    hideStatusColumn: true,
    prefilledHost: "",
    permissionType: PERM_NAME,
    capabilityFilter,
  };

  let dialogLoaded = TestUtils.topicObserved("subdialog-loaded");

  browser.contentWindow.gSubDialog.open(
    "chrome://browser/content/preferences/dialogs/permissions.xhtml",
    { features: "resizable=yes" },
    params
  );

  let [dialogWin] = await dialogLoaded;
  return dialogWin;
}

function addMockPrincipalToIPPVPN(site, capability) {
  let principal =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(site);
  Services.perms.addFromPrincipal(principal, PERM_NAME, capability);
}

/**
 * If MODE_PREF === "all", adds 2 exclusions and 1 inclusion.
 * If MODE === "select", adds 2 inclusions and 1 exclusion.
 *
 * Once permissions have been set up, return an array of site origins
 * that we expect to be displayed in the dialog.
 * Eg. If our mode is "all", we expect the 2 site origins to be displayed
 * when our dialog is filtered to show exclusions only.
 *
 * @param {"all" | "select"} mode
 *  The site exceptions mode
 * @returns {Array<string>}
 *  An array of site origins that we expect to be displayed in the dialog
 *
 * @see MODE_PREF
 */
function setupTestExceptions(mode) {
  const site1 = "https://www.example.com";
  const site2 = "https://www.another.example.com";
  const site3 = "https://www.shouldbeignored.example.org";

  let expectedCapability;
  let unexpectedCapability;

  if (mode === ALL_MODE) {
    expectedCapability = Ci.nsIPermissionManager.DENY_ACTION;
    unexpectedCapability = Ci.nsIPermissionManager.ALLOW_ACTION;
  } else {
    expectedCapability = Ci.nsIPermissionManager.ALLOW_ACTION;
    unexpectedCapability = Ci.nsIPermissionManager.DENY_ACTION;
  }

  // Let's add 2 exclusions if mode === "all", OR 2 inclusions if mode === "select"
  addMockPrincipalToIPPVPN(site1, expectedCapability);
  addMockPrincipalToIPPVPN(site2, expectedCapability);

  // And let's add 1 inclusion if mode === "all", OR 2 exceptions if mode === "select"
  addMockPrincipalToIPPVPN(site3, unexpectedCapability);

  // Before we test our dialog, let's double check that exceptions were loaded correctly.
  let expectedExceptions = Services.perms
    .getAllByTypes([PERM_NAME])
    .filter(perm => perm.capability === expectedCapability);
  let unexpectedExceptions = Services.perms
    .getAllByTypes([PERM_NAME])
    .filter(perm => perm.capability === unexpectedCapability);

  let expectedTypeName = mode === ALL_MODE ? "exclusions" : "inclusions";
  let unexpectedTypeName = mode === ALL_MODE ? "inclusion" : "exclusion";

  Assert.equal(
    expectedExceptions.length,
    2,
    `There should be 2 ${expectedTypeName}`
  );
  Assert.equal(
    unexpectedExceptions.length,
    1,
    `There should be 1 ${unexpectedTypeName}`
  );

  return expectedExceptions.map(permission => permission.principal.prePath);
}

/**
 * Opens the permissions dialog for ipp-vpn permissions with a capabilityFilter.
 * If our filter is set to DENY, then tests that only site exclusions / principals
 * with DENY capability are listed.
 * If our filter is set to ALLOW, then tests that only site inclusions / principals
 * with ALLOW capability are listed.
 *
 * @param {Array<string>} expectedSites
 *  An array of site origins that we expect to be displayed in the dialog.
 * @param {1 | 2} capabilityFilter
 *  Ci.nsIPermissionManager.DENY_ACTION or Ci.nsIPermissionManager.ALLOW_ACTION
 */
async function testExceptionsInDialog(expectedSites, capabilityFilter) {
  await BrowserTestUtils.withNewTab("about:preferences", async browser => {
    let dialog = await openDialog(browser, capabilityFilter);
    Assert.ok(dialog, "Dialog was found");

    let permissionsBox = dialog.document.getElementById("permissionsBox");

    // Wait for all exceptions to load
    await BrowserTestUtils.waitForMutationCondition(
      permissionsBox,
      { childList: true, subtree: true },
      () => {
        return permissionsBox.itemCount === 2;
      }
    );

    let numberOfExceptions = permissionsBox.itemCount;
    Assert.equal(
      numberOfExceptions,
      2,
      "There should be 2 inclusions in the dialog"
    );

    let displayedSites = Array.from(permissionsBox.children).map(entry =>
      entry.getAttribute("origin")
    );
    Assert.ok(
      displayedSites.includes(expectedSites[0]),
      `${expectedSites[0]} was displayed in the dialog as an exception`
    );
    Assert.ok(
      displayedSites.includes(expectedSites[1]),
      `${expectedSites[1]} was displayed in the dialog as an exception`
    );
  });
}

function cleanupExceptions() {
  Services.perms.removeByType(PERM_NAME);
}

/**
 * Tests that we can filter the permissions dialog to only show
 * exclusions.
 */
add_task(async function test_filter_dialog_exclusions_only() {
  await SpecialPowers.pushPrefEnv({
    set: [[MODE_PREF, ALL_MODE]],
  });

  let exclusions = setupTestExceptions(ALL_MODE);

  const capabilityFilter = Ci.nsIPermissionManager.DENY_ACTION;

  await testExceptionsInDialog(exclusions, capabilityFilter);

  cleanupExceptions();
  await SpecialPowers.popPrefEnv();
  Services.prefs.clearUserPref(ONBOARDING_MESSAGE_MASK_PREF);
});

/**
 * Tests that we can filter the permissions dialog to only show
 * inclusions.
 */
add_task(async function test_filter_dialog_inclusions_only() {
  await SpecialPowers.pushPrefEnv({
    set: [[MODE_PREF, SELECT_MODE]],
  });

  let inclusions = setupTestExceptions(SELECT_MODE);

  const capabilityFilter = Ci.nsIPermissionManager.ALLOW_ACTION;

  await testExceptionsInDialog(inclusions, capabilityFilter);

  cleanupExceptions();
  await SpecialPowers.popPrefEnv();
  Services.prefs.clearUserPref(ONBOARDING_MESSAGE_MASK_PREF);
});
