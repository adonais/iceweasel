/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/*
 * FaviconLoader debounces icon parsing through a DeferredTask. Without an idle
 * timeout that task waits indefinitely for an idle slot, so content that keeps
 * its process' main thread busy can suppress favicon updates for as long as it
 * likes. Check that an icon change still lands in that case.
 */

const TEST_ROOT =
  "http://mochi.test:8888/browser/browser/base/content/test/favicons/";
const TEST_URL = TEST_ROOT + "file_favicon_idle_starvation.html";

// FAVICON_PARSING_TIMEOUT (100ms) + FAVICON_PARSING_MAX_IDLE_WAIT (3000ms) +
// slack for slow machines.
const MAX_ICON_DELAY_MS = 7000;
const POLL_INTERVAL_MS = 100;

function trackFavicon(browser, url) {
  let seen = false;
  let listener = {
    onLinkIconAvailable(b, dataURI, iconURI) {
      if (b === browser && iconURI == url) {
        seen = true;
      }
    },
  };
  gBrowser.addTabsProgressListener(listener);
  registerCleanupFunction(() => gBrowser.removeTabsProgressListener(listener));
  return {
    async wait() {
      await TestUtils.waitForCondition(
        () => seen,
        `Waiting for favicon ${url}`,
        POLL_INTERVAL_MS,
        MAX_ICON_DELAY_MS / POLL_INTERVAL_MS
      ).finally(() => gBrowser.removeTabsProgressListener(listener));
      return seen;
    },
  };
}

function dispatchToContent(browser, eventName) {
  return SpecialPowers.spawn(browser, [eventName], name => {
    content.dispatchEvent(new content.CustomEvent(name));
  });
}

add_task(async function test_favicon_updates_during_idle_starvation() {
  let tab = BrowserTestUtils.addTab(gBrowser);
  let browser = tab.linkedBrowser;

  // Register the listener before loading so we can't miss the initial favicon.
  let firstIcon = trackFavicon(
    browser,
    TEST_ROOT + "file_bug970276_favicon1.ico"
  );
  BrowserTestUtils.startLoadingURIString(browser, TEST_URL);
  await BrowserTestUtils.browserLoaded(browser);
  ok(await firstIcon.wait(), "Initial favicon loaded.");

  await dispatchToContent(browser, "TestStarveIdleCallbacks");

  // Ensure we're properly starving idle callbacks.
  let idleStarved = await SpecialPowers.spawn(browser, [], async () => {
    let fired = false;
    ChromeUtils.idleDispatch(() => {
      fired = true;
    });
    await new Promise(resolve => content.setTimeout(resolve, 1000));
    return !fired;
  });
  ok(idleStarved, "An idle callback didn't fire.");

  let secondIcon = trackFavicon(browser, TEST_ROOT + "moz.png");

  let start = Date.now();
  await dispatchToContent(browser, "TestChangeFavicon");
  let updated = await secondIcon.wait();
  let elapsed = Date.now() - start;

  await dispatchToContent(browser, "TestStopIdleStarvation");

  ok(
    updated,
    `Favicon updated after ${elapsed}ms while idle callbacks were starved.`
  );

  await BrowserTestUtils.removeTab(tab);
});
