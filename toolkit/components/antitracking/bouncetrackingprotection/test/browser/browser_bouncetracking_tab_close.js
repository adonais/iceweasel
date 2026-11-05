/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let bounceTrackingProtection;

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
  bounceTrackingProtection = Cc[
    "@mozilla.org/bounce-tracking-protection;1"
  ].getService(Ci.nsIBounceTrackingProtection);
});

// Tests that the bounce tracking protection feature works correctly when the
// tab is closed before the extended navigation ends.
// The bounce tracker should still be classified and purged correctly.

add_task(async function test_bounce_tab_close() {
  info(
    "Test bounce where extended navigation ends early because of tab close."
  );
  await runTestBounce({
    bounceType: "server",
    setState: "cookie-server",
    closeTabAfterBounce: true,
  });
});

// Tests that closing the tab while the destination is still loading also
// classifies the destination. It is in the bounce set, but the record has no
// final host to exempt it yet.
add_task(async function test_bounce_tab_close_before_destination_loaded() {
  let stalledLoadURL = new URL(getBaseUrl(ORIGIN_B) + "file_stalled_load.sjs");
  registerCleanupFunction(() => fetch(`${stalledLoadURL.href}?release`));

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    getBaseUrl(ORIGIN_A) + "file_start.html"
  );
  let browser = tab.linkedBrowser;

  let promiseRecordBounces = waitForRecordBounces(browser);
  // The destination commits once the parent has received its response, which
  // adds it to the bounce set.
  let promiseDestinationCommitted = BrowserTestUtils.waitForLocationChange(
    gBrowser,
    stalledLoadURL.href
  );
  await navigateLinkClick(
    browser,
    getBounceURL({ bounceType: "server", targetURL: stalledLoadURL })
  );
  await promiseDestinationCommitted;

  BrowserTestUtils.removeTab(tab);
  await promiseRecordBounces;

  Assert.deepEqual(
    bounceTrackingProtection
      .testGetBounceTrackerCandidateHosts({})
      .map(entry => entry.siteHost)
      .sort(),
    [SITE_B, SITE_TRACKER].sort(),
    "Should have classified both the bounce tracker and the destination."
  );
  Assert.deepEqual(
    bounceTrackingProtection
      .testGetUserActivationHosts({})
      .map(entry => entry.siteHost),
    [SITE_A],
    "Should only have user activation for the site where we clicked the link."
  );
  Assert.deepEqual(
    (await bounceTrackingProtection.testRunPurgeBounceTrackers()).sort(),
    [SITE_B, SITE_TRACKER].sort(),
    "Should purge both the bounce tracker and the destination."
  );

  bounceTrackingProtection.clearAll();
  await SiteDataTestUtils.clear();
});
