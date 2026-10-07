/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 2064392 - Tests that the opener-after-user-interaction heuristic is
 * triggered by the very first user interaction in the opened window, i.e. when
 * the opened window's principal doesn't have a user-interaction permission yet.
 */

const TEST_POPUP_ORIGIN = TEST_DOMAIN_7.slice(0, -1);

function checkStorageAccessPermission(top, third, set) {
  return SpecialPowers.testPermission(
    `3rdPartyStorage^${third}`,
    set ? Services.perms.ALLOW_ACTION : Services.perms.UNKNOWN_ACTION,
    top
  );
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["network.cookie.cookieBehavior", BEHAVIOR_PARTITION_FOREIGN],
      ["network.cookie.cookieBehavior.pbmode", BEHAVIOR_PARTITION_FOREIGN],
      [
        "privacy.restrict3rdpartystorage.heuristic.opened_window_after_interaction",
        true,
      ],
      // Disable the plain window.open heuristic so that only the
      // opener-after-user-interaction heuristic can grant the permission.
      ["privacy.restrict3rdpartystorage.heuristic.window_open", false],
    ],
  });

  registerCleanupFunction(clearSiteTestData);

  await clearSiteTestData();
});

add_task(async function test_first_user_interaction_triggers_heuristic() {
  info("Creating a new tab.");
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TEST_TOP_PAGE
  );

  info("Call window.open() in the first-party context.");
  let tabOpenPromise = BrowserTestUtils.waitForNewTab(gBrowser);

  await SpecialPowers.spawn(tab.linkedBrowser, [TEST_TOP_PAGE_7], domain => {
    content.open(domain);
  });

  let openedTab = await tabOpenPromise;

  ok(
    await checkStorageAccessPermission(TEST_TOP_PAGE, TEST_POPUP_ORIGIN, false),
    "The storage access permission isn't set before the user interaction"
  );

  info("Trigger the first user interaction in the popup.");
  await SpecialPowers.spawn(openedTab.linkedBrowser, [], () => {
    content.document.userInteractionForTesting();
  });

  info("Verify that the opener-after-user-interaction heuristic ran.");
  await TestUtils.waitForCondition(
    () => checkStorageAccessPermission(TEST_TOP_PAGE, TEST_POPUP_ORIGIN, true),
    "Waiting for the storage access permission to be granted"
  );

  BrowserTestUtils.removeTab(openedTab);
  BrowserTestUtils.removeTab(tab);
});
