/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_PAGE =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://example.com"
  ) + "dummy_page.html";

async function runTest(privilegedLoad) {
  for (let requireUserInteraction of [true, false]) {
    Services.prefs.setBoolPref(
      "browser.navigation.requireUserInteraction",
      requireUserInteraction
    );

    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      TEST_PAGE + "?entry=0"
    );
    let browser = tab.linkedBrowser;

    // Add some user interaction to the initial entry
    await SpecialPowers.spawn(browser, [], () => {
      content.document.notifyUserGestureActivation();
    });

    assertBackForwardState(false, false);

    await followLink(TEST_PAGE + "?entry=1");

    assertBackForwardState(true, false);

    await followLink(TEST_PAGE + "?entry=2");

    assertBackForwardState(true, false);

    await followLink(TEST_PAGE + "?entry=3");

    assertBackForwardState(true, false);

    // Entry 4 will be added through a user action in browser chrome,
    // giving user interaction to entry 3. Entry 4 should not gain automatic
    // user interaction.
    await privilegedLoad(TEST_PAGE + "?entry=4");

    assertBackForwardState(true, false);

    await followLink(TEST_PAGE + "?entry=5");

    assertBackForwardState(true, false);

    if (!requireUserInteraction) {
      await goBack(TEST_PAGE + "?entry=4");
    }
    await goBack(TEST_PAGE + "?entry=3");

    if (!requireUserInteraction) {
      await goBack(TEST_PAGE + "?entry=2");
      await goBack(TEST_PAGE + "?entry=1");
    }

    assertBackForwardState(true, true);

    await goBack(TEST_PAGE + "?entry=0");

    assertBackForwardState(false, true);

    if (!requireUserInteraction) {
      await goForward(TEST_PAGE + "?entry=1");
      await goForward(TEST_PAGE + "?entry=2");
    }

    await goForward(TEST_PAGE + "?entry=3");

    assertBackForwardState(true, true);

    if (!requireUserInteraction) {
      await goForward(TEST_PAGE + "?entry=4");
    }

    await goForward(TEST_PAGE + "?entry=5");

    assertBackForwardState(true, false);

    BrowserTestUtils.removeTab(tab);
  }

  Services.prefs.clearUserPref("browser.navigation.requireUserInteraction");
}

// Test that we add a user interaction flag to the previous site when loading
// a new site from user interaction with privileged UI, e.g. through the
// URL bar.
add_task(async function test_urlBar() {
  await runTest(async function (url) {
    info(`Loading ${url} via the URL bar.`);
    let browser = gBrowser.selectedBrowser;
    let loaded = BrowserTestUtils.browserLoaded(browser, false, url);
    gURLBar.focus();
    gURLBar.value = url;
    gURLBar.goButton.click();
    await loaded;
  });
});

// A session history load carries the target entry's original triggering
// principal, which is the system principal for anything that was loaded from
// browser UI. Going back to such an entry must not count as user interaction
// with the entry we are leaving.
add_task(async function test_goBackDoesNotAddUserInteraction() {
  // A bfcached entry is restored in the parent without a load, which would not
  // exercise the session history load path at all.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.sessionhistory.max_total_viewers", 0]],
  });

  // Opened from the parent process, so entry 0's triggering principal is the
  // system principal.
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TEST_PAGE + "?entry=0"
  );
  let browser = tab.linkedBrowser;
  await SpecialPowers.spawn(browser, [], () => {
    content.document.notifyUserGestureActivation();
  });

  await followLink(TEST_PAGE + "?entry=1");
  await goBack(TEST_PAGE + "?entry=0");

  let sessionHistory = browser.browsingContext.sessionHistory;
  is(sessionHistory.count, 2, "Two session history entries");
  is(
    sessionHistory.getEntryAtIndex(1).hasUserInteraction,
    false,
    "Going back did not add user interaction to the entry we left"
  );

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
