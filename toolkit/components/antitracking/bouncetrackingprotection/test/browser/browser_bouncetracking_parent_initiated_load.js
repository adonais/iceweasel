/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Regression test for Bug 2056952. Top level navigations that are initiated in
// the parent process go through DocumentLoadListener::OpenInParent instead of
// OpenDocument. OpenInParent used to skip the
// BounceTrackingState::OnStartNavigation call, so the BounceTrackingRecord was
// never created and OnDocumentStartRequest / OnResponseReceived failed. As a
// result server side bounces from parent initiated loads were never classified.
//
// This happens in two common real world cases:
//  - A content initiated cross-site top level navigation. Under Fission this
//    switches process and the parent initiates the load (WindowGlobalParent::
//    RecvLoadURI -> OpenInParent) carrying the page's content principal.
//  - An address bar / bookmark load, which the parent initiates with the system
//    principal.

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

// A server side bounce reached via a content initiated cross-process top level
// navigation must classify the redirecting site. Under Fission the cross-site
// navigation switches process, so the parent initiates the load through
// DocumentLoadListener::OpenInParent carrying the page's content principal.
// Before Bug 2056952 OpenInParent skipped OnStartNavigation, no record was
// created and the tracker was never classified.
add_task(async function test_content_parent_load_server_bounce() {
  bounceTrackingProtection.clearAll();
  Assert.equal(
    bounceTrackingProtection.testGetBounceTrackerCandidateHosts({}).length,
    0,
    "No bounce tracker hosts initially."
  );

  let initialURL = getBaseUrl(ORIGIN_A) + "file_start.html";
  await BrowserTestUtils.withNewTab(initialURL, async browser => {
    let targetURL = new URL(getBaseUrl(ORIGIN_B) + "file_start.html");
    let bounceURL = getBounceURL({ bounceType: "server", targetURL });

    // Script a cross-site navigation to the bounce URL, which process switches
    // and makes the parent initiate the load.
    let targetLoaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      targetURL
    );
    await navigateContentParentLoad(browser, bounceURL);
    await targetLoaded;

    // End the extended navigation with a user activated navigation, which
    // triggers RecordStatefulBounces.
    await navigateLinkClick(
      browser,
      new URL(getBaseUrl(ORIGIN_C) + "file_start.html")
    );

    // The tracker is only recorded via OnDocumentStartRequest ->
    // OnResponseReceived, which needs the record created by OnStartNavigation on
    // the parent initiated load. Poll so a missing fix fails fast here instead
    // of hanging.
    await TestUtils.waitForCondition(
      () =>
        bounceTrackingProtection
          .testGetBounceTrackerCandidateHosts({})
          .some(entry => entry.siteHost == SITE_TRACKER),
      `Waiting for ${SITE_TRACKER} to be classified as a bounce tracker.`
    );

    let purgedHosts =
      await bounceTrackingProtection.testRunPurgeBounceTrackers();
    Assert.ok(
      purgedHosts.includes(SITE_TRACKER),
      `Should purge ${SITE_TRACKER} from the parent initiated bounce. Got: ${JSON.stringify(
        purgedHosts
      )}`
    );

    bounceTrackingProtection.clearAll();
  });

  await SiteDataTestUtils.clear();
});

// A server side bounce started from the address bar (parent process, system
// principal) must still classify the redirecting site as a bounce tracker.
// The system principal load counts as a user activation, which ends the initial
// extended navigation and starts a new one, so the resulting state differs from
// the link click case and we assert on classification directly.
add_task(async function test_url_bar_server_bounce() {
  bounceTrackingProtection.clearAll();
  Assert.equal(
    bounceTrackingProtection.testGetBounceTrackerCandidateHosts({}).length,
    0,
    "No bounce tracker hosts initially."
  );

  let initialURL = getBaseUrl(ORIGIN_A) + "file_start.html";
  await BrowserTestUtils.withNewTab(initialURL, async browser => {
    let targetURL = new URL(getBaseUrl(ORIGIN_B) + "file_start.html");
    let bounceURL = getBounceURL({ bounceType: "server", targetURL });

    // Load the bounce URL the way the address bar does.
    let targetLoaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      targetURL
    );
    await navigateSystemPrincipalLoad(browser, bounceURL);
    await targetLoaded;

    // End the extended navigation with a user activated navigation, which
    // triggers RecordStatefulBounces.
    await navigateLinkClick(
      browser,
      new URL(getBaseUrl(ORIGIN_C) + "file_start.html")
    );

    // Wait for the tracker to be classified. The tracker is only recorded via
    // OnDocumentStartRequest -> OnResponseReceived, which needs the record
    // created by OnStartNavigation in OpenInParent. Before Bug 2056952 the
    // record was missing for address bar loads so this never happened.
    // Polling avoids racing the grace period driven purge below.
    await TestUtils.waitForCondition(
      () =>
        bounceTrackingProtection
          .testGetBounceTrackerCandidateHosts({})
          .some(entry => entry.siteHost == SITE_TRACKER),
      `Waiting for ${SITE_TRACKER} to be classified as a bounce tracker.`
    );

    let purgedHosts =
      await bounceTrackingProtection.testRunPurgeBounceTrackers();
    Assert.ok(
      purgedHosts.includes(SITE_TRACKER),
      `Should purge ${SITE_TRACKER} from the address bar bounce. Got: ${JSON.stringify(
        purgedHosts
      )}`
    );

    bounceTrackingProtection.clearAll();
  });

  await SiteDataTestUtils.clear();
});
