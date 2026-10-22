/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Regression tests for Bug 2061167. A navigation without user activation adds
// a bounce candidate, which used to be the navigation's triggering principal.
// For a same-tab client redirect that is also the document being navigated
// away from, but a script in another tab or a frame allowed to navigate the top
// level can issue the navigation with no gesture, and was then credited with a
// bounce it never performed. The candidate is now the site the navigated
// context is leaving.
//
// Every task runs the same navigation out of the tracker, whose site is the
// extended navigation's initial host and therefore exempt. They differ only in
// which context issues it.

let bounceTrackingProtection = Cc[
  "@mozilla.org/bounce-tracking-protection;1"
].getService(Ci.nsIBounceTrackingProtection);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "privacy.bounceTrackingProtection.mode",
        Ci.nsIBounceTrackingProtection.MODE_ENABLED,
      ],
      // The cross-tab navigation runs script in the opener, which sits in a
      // background tab. If that is slow enough for the client bounce timer to
      // finalize the opened tab's record first, the navigation starts a new
      // record instead of adding a bounce candidate, and the test passes
      // without exercising anything.
      [
        "privacy.bounceTrackingProtection.clientBounceDetectionTimerPeriodMS",
        600000,
      ],
      // Lowering a background process' main thread QoS can starve the opener
      // for tens of seconds on a loaded machine.
      ["threads.lower_mainthread_priority_in_background.enabled", false],
    ],
  });
  // Settling a tab on the tracker records user activation for the tracker,
  // which lives in the global map and would exempt it from purging in later
  // test files.
  registerCleanupFunction(() => {
    bounceTrackingProtection.clearAll();
  });
});

function getStartURL(origin) {
  return getBaseUrl(origin) + "file_start.html";
}

function assertNothingClassified(message) {
  let classified = bounceTrackingProtection
    .testGetBounceTrackerCandidateHosts({})
    .map(entry => entry.siteHost);
  Assert.deepEqual(classified, [], message);
}

/**
 * Opens a tab from the given browser's document.
 *
 * Grants transient activation, which the popup blocker requires, but
 * deliberately does not call userInteractionForTesting: that would record BTP
 * user activation for the opener and exempt it from classification, which is
 * what the cross-tab task asserts on.
 *
 * @param {MozBrowser} browser - Browser whose document opens the tab.
 * @param {URL} url - URL to open.
 * @returns {Promise<object>} The new tab.
 */
async function openTabFrom(browser, url) {
  let opened = BrowserTestUtils.waitForNewTab(gBrowser, url.href, true);
  await SpecialPowers.spawn(browser, [url.href], href => {
    SpecialPowers.wrap(content.document).notifyUserGestureActivation();
    let script = content.document.createElement("script");
    script.textContent = `window.__opened = window.open(${JSON.stringify(
      href
    )}, "opened");`;
    content.document.body.appendChild(script);
  });
  return opened;
}

/**
 * Assigns location.href from page script with no user activation.
 *
 * @param {MozBrowser|BrowsingContext} target - Context running the script.
 * @param {string} expression - JS expression for the window to navigate, e.g.
 * "window.__opened" for a cross-tab navigation or "window" for a same-tab one.
 * @param {URL} url - Destination.
 * @returns {Promise} Resolves once the script has run.
 */
async function navigateWithoutGesture(target, expression, url) {
  await SpecialPowers.spawn(
    target,
    [expression, url.href],
    (expression, href) => {
      let script = content.document.createElement("script");
      script.textContent = `${expression}.location.href = ${JSON.stringify(
        href
      )};`;
      content.document.body.appendChild(script);
    }
  );
}

/**
 * Settles the browser on the tracker with an activated same-site navigation.
 * This ends whatever extended navigation brought it there and begins one whose
 * initial host is the tracker, so that a later credit of some other site is not
 * masked by the initial host exemption.
 *
 * @param {MozBrowser} browser - Browser currently on the tracker.
 * @returns {Promise} Resolves once the settled document has loaded.
 */
async function settleOnTracker(browser) {
  let trackerURL = new URL(getStartURL(ORIGIN_TRACKER) + "?settled");
  let loaded = BrowserTestUtils.browserLoaded(browser, false, trackerURL.href);
  await navigateLinkClick(browser, trackerURL);
  await loaded;
}

/**
 * Opens a tab on the tracker from the given browser's document and settles it.
 *
 * @param {MozBrowser} browser - Browser which opens the tab.
 * @returns {Promise<object>} The opened tab, sitting on the tracker.
 */
async function openTabOnTracker(browser) {
  let openedTab = await openTabFrom(
    browser,
    new URL(getStartURL(ORIGIN_TRACKER))
  );
  await settleOnTracker(openedTab.linkedBrowser);
  return openedTab;
}

/**
 * Ends the extended navigation of the given browser with an activated
 * navigation and waits for the record to be finalized.
 *
 * @param {MozBrowser} browser - Browser to navigate.
 * @returns {Promise} Resolves once bounces have been recorded.
 */
async function finalize(browser) {
  let endURL = new URL(getStartURL(ORIGIN_B) + "?end");
  let loaded = BrowserTestUtils.browserLoaded(browser, false, endURL.href);
  let recorded = waitForRecordBounces(browser, 0);
  await navigateLinkClick(browser, endURL);
  await loaded;
  await recorded;
}

// The opener navigates the other tab away from the tracker with no gesture. It
// never navigated itself, so it must not be credited with that bounce.
add_task(async function test_cross_tab_initiator_is_not_credited() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let openedTab = await openTabOnTracker(browser);
    let openedBrowser = openedTab.linkedBrowser;

    let destURL = new URL(getStartURL(ORIGIN_B));
    let loaded = BrowserTestUtils.browserLoaded(
      openedBrowser,
      false,
      destURL.href
    );
    await navigateWithoutGesture(browser, "window.__opened", destURL);
    await loaded;

    await finalize(openedBrowser);
    await BrowserTestUtils.removeTab(openedTab);
  });

  assertNothingClassified(
    `${SITE_A} only scripted another tab and never navigated itself, so it ` +
      `should not be credited with a bounce.`
  );
});

// A cross-site frame allowed to navigate the top level without a gesture, here
// by sandbox="allow-top-navigation", must not be credited either. The site
// being left is the page hosting it.
add_task(async function test_frame_initiator_is_not_credited() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(
    getStartURL(ORIGIN_TRACKER),
    async browser => {
      await settleOnTracker(browser);

      // allow-same-origin keeps the frame's own principal. Without it the
      // initiator is opaque and was never credited in the first place.
      let frameBC = await insertIframeAndWaitForLoad(
        browser,
        getStartURL(ORIGIN_A),
        { sandbox: "allow-scripts allow-same-origin allow-top-navigation" }
      );

      let destURL = new URL(getStartURL(ORIGIN_B));
      let loaded = BrowserTestUtils.browserLoaded(browser, false, destURL.href);
      await navigateTopFromFrame(frameBC, destURL, { withGesture: false });
      await loaded;

      await finalize(browser);
    }
  );

  assertNothingClassified(
    `${SITE_A} only framebusted and was never navigated away from, so it ` +
      `should not be credited with a bounce.`
  );
});

// Control: the identical navigation out of the tracker, issued by the tracker's
// own document. This was already credited to the site being left.
add_task(async function test_same_tab_initiator_is_not_credited() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let openedTab = await openTabOnTracker(browser);
    let openedBrowser = openedTab.linkedBrowser;

    let destURL = new URL(getStartURL(ORIGIN_B));
    let loaded = BrowserTestUtils.browserLoaded(
      openedBrowser,
      false,
      destURL.href
    );
    await navigateWithoutGesture(openedBrowser, "window", destURL);
    await loaded;

    await finalize(openedBrowser);
    await BrowserTestUtils.removeTab(openedTab);
  });

  assertNothingClassified(
    `Only the tracker issued the navigation, and it is the exempt initial host.`
  );
});
