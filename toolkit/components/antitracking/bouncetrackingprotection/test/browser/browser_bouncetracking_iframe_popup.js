/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Bug 2060310: the sibling of the same-tab gap covered by
// browser_bouncetracking_iframe_initiated_load.js. Bug 1843308 / privacycg#50
// made a popup inherit its opener's site as the extended navigation's
// initialHost, so a tracker opened in a new tab can no longer exempt itself.
// When the popup is opened from a cross-site iframe though, the opener is the
// frame, so the tracker became its own initialHost again through a different
// door.
//
// The bounces here return the popup to SITE_A, so finalHost is SITE_A and the
// tracker can only be caught by resolving the opener frame to its top level
// document.

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
      ["privacy.bounceTrackingProtection.bounceTrackingGracePeriodSec", 0],
    ],
  });
});

function getStartURL(origin) {
  return getBaseUrl(origin) + "file_start.html";
}

/**
 * Opens a popup from the given context which bounces through the tracker and
 * ends on SITE_A, then ends the popup's extended navigation.
 *
 * @param {MozBrowser|BrowsingContext} opener - Context which opens the popup.
 * @returns {Promise} Resolves once the popup's extended navigation has ended.
 */
async function runPopupBounce(opener) {
  let targetURL = new URL(getStartURL(ORIGIN_A));
  let bounceURL = getBounceURL({
    bounceType: "server",
    bounceOrigin: ORIGIN_TRACKER,
    targetURL,
  });

  // Resolves once the new tab has opened and finished loading targetURL.
  let openPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    targetURL.href,
    true
  );

  await navigateLinkClick(opener, bounceURL, { spawnWindow: "newTab" });

  let popupTab = await openPromise;
  let popupBrowser = popupTab.linkedBrowser;

  // End the popup's extended navigation with a user activated navigation, and
  // wait for it to commit before tearing the context down.
  //
  // Same-site with initialHost: ending elsewhere starts a second extended
  // navigation holding that site, and closing the context finalizes it
  // (Bug 1921464) possibly before finalHost is set.
  let endURL = new URL(getStartURL(ORIGIN_A) + "?end");
  let endLoaded = BrowserTestUtils.browserLoaded(
    popupBrowser,
    false,
    endURL.href
  );
  let recordedBounces = waitForRecordBounces(popupBrowser, 0);
  await navigateLinkClick(popupBrowser, endURL);
  await endLoaded;
  await recordedBounces;

  await BrowserTestUtils.removeTab(popupTab);
}

// runPopupBounce has already awaited the finalization run, so this only reads a
// settled state.
function assertTrackerClassified() {
  Assert.ok(
    bounceTrackingProtection
      .testGetBounceTrackerCandidateHosts({})
      .some(entry => entry.siteHost == SITE_TRACKER),
    `${SITE_TRACKER} should be classified as a bounce tracker.`
  );
}

// A popup opened by a cross-site frame must attribute the frame's embedder, via the
// opener, so the tracker is not its own initialHost.
add_task(async function test_frame_opens_new_tab() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let frameBC = await insertIframeAndWaitForLoad(
      browser,
      getStartURL(ORIGIN_TRACKER)
    );
    await runPopupBounce(frameBC);
  });

  assertTrackerClassified();

  let purgedHosts = await bounceTrackingProtection.testRunPurgeBounceTrackers();
  Assert.ok(
    purgedHosts.includes(SITE_TRACKER),
    `Should purge ${SITE_TRACKER}. Got: ${JSON.stringify(purgedHosts)}`
  );

  let purgeLog = bounceTrackingProtection.testGetRecentlyPurgedTrackers({});
  Assert.equal(
    purgeLog.length,
    1,
    `Should have one tracker in purge log. Got: ${JSON.stringify(
      purgeLog.map(e => ({
        siteHost: e.siteHost,
        initialHost: e.bounceTrackingRecord?.initialHost,
        finalHost: e.bounceTrackingRecord?.finalHost,
        bounceHosts: e.bounceTrackingRecord?.bounceHosts,
      }))
    )}`
  );
  Assert.equal(
    purgeLog[0].bounceTrackingRecord.initialHost,
    SITE_A,
    "initialHost should be the opener frame's top level site, not the frame's."
  );
});

// A popup window rather than a tab resolves through the same opener, so it adds no
// coverage here; browser_bouncetracking_popup.js covers that shape.

// Regression guard for Bug 1843308 / privacycg#50: a popup opened from the top
// level document still inherits that document's site as initialHost, so the
// tracker in the popup's chain is still classified and SITE_A is still exempt.
add_task(async function test_top_level_opens_new_tab_unchanged() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    await runPopupBounce(browser);
  });

  assertTrackerClassified();

  await bounceTrackingProtection.testRunPurgeBounceTrackers();
  let purgeLog = bounceTrackingProtection.testGetRecentlyPurgedTrackers({});
  Assert.equal(
    purgeLog.length,
    1,
    `Should have one tracker in purge log. Got: ${JSON.stringify(
      purgeLog.map(e => ({
        siteHost: e.siteHost,
        initialHost: e.bounceTrackingRecord?.initialHost,
        finalHost: e.bounceTrackingRecord?.finalHost,
        bounceHosts: e.bounceTrackingRecord?.bounceHosts,
      }))
    )}`
  );
  Assert.equal(
    purgeLog[0].bounceTrackingRecord.initialHost,
    SITE_A,
    "initialHost for a top level opener is unchanged."
  );
});
