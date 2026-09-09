/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Regression tests for Bug 2060310. initialHost used to come from the navigation's
// triggering principal, so a cross-site frame which navigated the top level named
// itself and RecordStatefulBounces exempted it. It is now the site the context is
// leaving, so these cover each way a navigation can be initiated.
//
// The bounces deliberately return to the site they started from, so finalHost
// cannot mask a missing fix.

let bounceTrackingProtection = Cc[
  "@mozilla.org/bounce-tracking-protection;1"
].getService(Ci.nsIBounceTrackingProtection);

registerCleanupFunction(() => {
  // Clear the state after all the tasks.
  bounceTrackingProtection.clearAll();
});

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "privacy.bounceTrackingProtection.mode",
        Ci.nsIBounceTrackingProtection.MODE_ENABLED,
      ],
      // browser.toml's default 1h grace period would make these tests pass for
      // the wrong reason.
      ["privacy.bounceTrackingProtection.bounceTrackingGracePeriodSec", 0],
    ],
  });
});

function getStartURL(origin) {
  return getBaseUrl(origin) + "file_start.html";
}

/**
 * Destination used to end an extended navigation with a user activated
 * navigation.
 *
 * Deliberately same-site with initialHost. Ending elsewhere starts a second
 * extended navigation holding that site, and tab close finalizes it (Bug 1921464)
 * possibly before finalHost is set, classifying the site we ended on.
 */
function getEndURL() {
  return new URL(getStartURL(ORIGIN_A) + "?end");
}

/**
 * Runs a bounce which is initiated from a frame and returns to the top level
 * site, then ends the extended navigation.
 *
 * @param {object} options - Test options.
 * @param {string} options.frameOrigin - Origin to load the initiating frame from.
 * @param {('server'|'client')} options.bounceType - Redirect type for the bounce.
 * @param {string} [options.bounceOrigin=ORIGIN_TRACKER] - Origin which performs
 * the bounce.
 * @param {Function} options.trigger - Called with the frame's BrowsingContext and
 * the bounce URL to start the top level navigation.
 * @returns {Promise} Resolves once the extended navigation has ended.
 */
async function runFrameInitiatedBounce({
  frameOrigin,
  bounceType,
  bounceOrigin = ORIGIN_TRACKER,
  trigger,
}) {
  bounceTrackingProtection.clearAll();
  Assert.equal(
    bounceTrackingProtection.testGetBounceTrackerCandidateHosts({}).length,
    0,
    "No bounce tracker hosts initially."
  );

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let frameBC = await insertIframeAndWaitForLoad(
      browser,
      getStartURL(frameOrigin)
    );

    let targetURL = new URL(getStartURL(ORIGIN_A));
    let bounceURL = getBounceURL({ bounceType, bounceOrigin, targetURL });

    let targetLoaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      targetURL.href
    );
    await trigger(frameBC, bounceURL);
    await targetLoaded;

    // End the extended navigation with a user activated top level navigation,
    // which triggers RecordStatefulBounces. Waiting for count 0 resolves on the
    // run whatever it classified, so the assertions afterwards see a settled
    // state and a missing fix fails on the assertion rather than on a timeout.
    let recordedBounces = waitForRecordBounces(browser, 0);
    await navigateLinkClick(browser, getEndURL());
    await recordedBounces;
  });
}

// Callers must have awaited waitForRecordBounces first, so this only reads a
// settled state.
function assertTrackerClassified() {
  Assert.ok(
    bounceTrackingProtection
      .testGetBounceTrackerCandidateHosts({})
      .some(entry => entry.siteHost == SITE_TRACKER),
    `${SITE_TRACKER} should be classified as a bounce tracker.`
  );
}

function assertNothingClassified() {
  Assert.deepEqual(
    bounceTrackingProtection
      .testGetBounceTrackerCandidateHosts({})
      .map(entry => entry.siteHost),
    [],
    "Should not classify any bounce trackers."
  );
}

// A cross-site frame which navigates the top level via <a target="_top"> must
// not exempt itself. This is the reported scenario.
add_task(async function test_frame_link_top_target_server_bounce() {
  await runFrameInitiatedBounce({
    frameOrigin: ORIGIN_TRACKER,
    bounceType: "server",
    trigger: (frameBC, bounceURL) =>
      navigateLinkClick(frameBC, bounceURL, { linkTarget: "_top" }),
  });

  assertTrackerClassified();

  let purgedHosts = await bounceTrackingProtection.testRunPurgeBounceTrackers();
  Assert.ok(
    purgedHosts.includes(SITE_TRACKER),
    `Should purge ${SITE_TRACKER}. Got: ${JSON.stringify(purgedHosts)}`
  );

  // Assert the mechanism, not just the outcome. initialHost is SITE_TRACKER on
  // an unfixed tree, which is what let the tracker skip classification.
  let purgeLog = bounceTrackingProtection.testGetRecentlyPurgedTrackers({});
  Assert.equal(
    purgeLog.length,
    1,
    `Should have one tracker in purge log. Got: ${JSON.stringify(
      purgeLog.map(entry => ({
        siteHost: entry.siteHost,
        initialHost: entry.bounceTrackingRecord?.initialHost,
        finalHost: entry.bounceTrackingRecord?.finalHost,
        bounceHosts: entry.bounceTrackingRecord?.bounceHosts,
      }))
    )}`
  );
  let { bounceTrackingRecord } = purgeLog[0];
  Assert.equal(
    bounceTrackingRecord.initialHost,
    SITE_A,
    "initialHost should be the top level site, not the initiating frame's site."
  );
  Assert.equal(
    bounceTrackingRecord.finalHost,
    SITE_A,
    "finalHost should be the top level site."
  );
  Assert.ok(
    bounceTrackingRecord.bounceHosts.includes(SITE_TRACKER),
    `Bounce hosts should include '${SITE_TRACKER}'.`
  );

  // Pins the other half of the escape hatch: the click happened in the tracker's
  // frame, but activation is attributed to the top level site, which is why
  // fixing initialHost alone is sufficient.
  let userActivationHosts = bounceTrackingProtection
    .testGetUserActivationHosts({})
    .map(entry => entry.siteHost);
  Assert.ok(
    userActivationHosts.includes(SITE_A),
    `User activation should be recorded for ${SITE_A}.`
  );
  Assert.ok(
    !userActivationHosts.includes(SITE_TRACKER),
    `User activation should not be recorded for ${SITE_TRACKER}.`
  );
});

// Same, but a client side bounce, which reaches the bounce set through
// OnStartNavigation's AddBounceHost path as well as the redirect chain.
add_task(async function test_frame_link_top_target_client_bounce() {
  await runFrameInitiatedBounce({
    frameOrigin: ORIGIN_TRACKER,
    bounceType: "client",
    trigger: (frameBC, bounceURL) =>
      navigateLinkClick(frameBC, bounceURL, { linkTarget: "_top" }),
  });

  assertTrackerClassified();
});

// window.top.location assignment goes through BrowsingContext::Navigate rather
// than the link click path.
add_task(async function test_frame_top_location_server_bounce() {
  await runFrameInitiatedBounce({
    frameOrigin: ORIGIN_TRACKER,
    bounceType: "server",
    trigger: (frameBC, bounceURL) => navigateTopFromFrame(frameBC, bounceURL),
  });

  assertTrackerClassified();
});

// The initiating frame going away while the navigation is in flight must not give
// it its own exemption back. Which code path supplies the initial host depends on
// whether the frame's WindowGlobalParent is still resolvable when the parent
// starts the load, so this asserts the outcome rather than the path: either way
// the initial host has to be the top level site and the tracker has to be
// classified.
add_task(async function test_frame_removed_after_triggering() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let frameBC = await insertIframeAndWaitForLoad(
      browser,
      getStartURL(ORIGIN_TRACKER)
    );

    let targetURL = new URL(getStartURL(ORIGIN_A));
    let bounceURL = getBounceURL({
      bounceType: "server",
      bounceOrigin: ORIGIN_TRACKER,
      targetURL,
    });

    let targetLoaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      targetURL.href
    );
    await navigateLinkClick(frameBC, bounceURL, { linkTarget: "_top" });

    // Drop the frame straight after it started the navigation.
    await SpecialPowers.spawn(browser, [], () => {
      content.document.querySelector("iframe").remove();
    });

    await targetLoaded;
    let recordedBounces = waitForRecordBounces(browser, 0);
    await navigateLinkClick(browser, getEndURL());
    await recordedBounces;
  });

  assertTrackerClassified();

  await bounceTrackingProtection.testRunPurgeBounceTrackers();
  let purgeLog = bounceTrackingProtection.testGetRecentlyPurgedTrackers({});
  Assert.equal(purgeLog.length, 1, "Should have one tracker in purge log.");
  Assert.equal(
    purgeLog[0].bounceTrackingRecord.initialHost,
    SITE_A,
    "initialHost should still be the top level site with the frame gone."
  );
});

// In every other case here the initiator sits inside the context being navigated,
// so "the site being left" and "the initiator's site" are the same answer. A
// navigation driven from another tab is the only shape where they differ, which
// makes this the test that pins down which of the two we use.
add_task(async function test_cross_tab_initiator_uses_navigated_context() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    // Open a second tab from A which loads a real document, so it has a committed
    // top level site of its own, and keep a reference to it in A.
    let popupURL = new URL(getStartURL(ORIGIN_B));
    let popupPromise = BrowserTestUtils.waitForNewTab(
      gBrowser,
      popupURL.href,
      true
    );
    await SpecialPowers.spawn(browser, [popupURL.href], url => {
      SpecialPowers.wrap(content.document).notifyUserGestureActivation();
      content.document.userInteractionForTesting();
      let script = content.document.createElement("script");
      script.textContent = `window.__popup = window.open(${JSON.stringify(
        url
      )}, "b");`;
      content.document.body.appendChild(script);
    });
    let popupTab = await popupPromise;
    let popupBrowser = popupTab.linkedBrowser;

    let targetURL = new URL(getStartURL(ORIGIN_B));
    let bounceURL = getBounceURL({
      bounceType: "server",
      bounceOrigin: ORIGIN_TRACKER,
      targetURL,
    });

    // Navigate the second tab from the first tab's document. The gesture is what
    // makes this start a new extended navigation rather than extend the popup's
    // existing one.
    let bounced = BrowserTestUtils.browserLoaded(
      popupBrowser,
      false,
      targetURL.href
    );
    await SpecialPowers.spawn(browser, [bounceURL.href], url => {
      SpecialPowers.wrap(content.document).notifyUserGestureActivation();
      content.document.userInteractionForTesting();
      let script = content.document.createElement("script");
      script.textContent = `window.__popup.location.href = ${JSON.stringify(
        url
      )};`;
      content.document.body.appendChild(script);
    });
    await bounced;

    // End on a site same-site with the expected initial host, see getEndURL.
    let endURL = new URL(getStartURL(ORIGIN_B) + "?end");
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
  });

  assertTrackerClassified();

  await bounceTrackingProtection.testRunPurgeBounceTrackers();
  let purgeLog = bounceTrackingProtection.testGetRecentlyPurgedTrackers({});
  Assert.equal(purgeLog.length, 1, "Should have one tracker in purge log.");
  Assert.equal(
    purgeLog[0].bounceTrackingRecord.initialHost,
    SITE_B,
    "initialHost should be the site the navigated tab is leaving."
  );
});

// A navigation started by the browser rather than by content still leaves a site,
// so the departing site is the initial host. The derivation deliberately does not
// depend on the initiator, which a browser initiated navigation does not have.
add_task(async function test_browser_initiated_load_uses_departing_site() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let targetURL = new URL(getStartURL(ORIGIN_A));
    let bounceURL = getBounceURL({
      bounceType: "server",
      bounceOrigin: ORIGIN_TRACKER,
      targetURL,
    });

    let targetLoaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      targetURL.href
    );
    await navigateSystemPrincipalLoad(browser, bounceURL);
    await targetLoaded;

    let recordedBounces = waitForRecordBounces(browser, 0);
    await navigateLinkClick(browser, getEndURL());
    await recordedBounces;
  });

  assertTrackerClassified();

  await bounceTrackingProtection.testRunPurgeBounceTrackers();
  let purgeLog = bounceTrackingProtection.testGetRecentlyPurgedTrackers({});
  Assert.equal(purgeLog.length, 1, "Should have one tracker in purge log.");
  Assert.equal(
    purgeLog[0].bounceTrackingRecord.initialHost,
    SITE_A,
    "A browser initiated navigation should use the site being left."
  );
});

// A cross-site frame can framebust without transient activation when it is allowed
// to by other means, here sandbox="allow-top-navigation". The gesture is what
// normally ends the extended navigation and starts a new one, so without it the
// derivation is only reached when no record is live, which is why this clears
// between the frame load and the navigation.
add_task(async function test_sandboxed_frame_gesture_free_top_navigation() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let frameBC = await insertIframeAndWaitForLoad(
      browser,
      getStartURL(ORIGIN_TRACKER),
      { sandbox: "allow-scripts allow-same-origin allow-top-navigation" }
    );

    // Drop the record created by the load of A above, so the gesture-free
    // navigation creates one and derives an initial host rather than only adding
    // a bounce candidate to the existing record.
    bounceTrackingProtection.clearAll();

    let targetURL = new URL(getStartURL(ORIGIN_A));
    let bounceURL = getBounceURL({
      bounceType: "server",
      bounceOrigin: ORIGIN_TRACKER,
      targetURL,
    });

    let targetLoaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      targetURL.href
    );
    await navigateTopFromFrame(frameBC, bounceURL, { withGesture: false });
    await targetLoaded;

    let recordedBounces = waitForRecordBounces(browser, 0);
    await navigateLinkClick(browser, getEndURL());
    await recordedBounces;
  });

  assertTrackerClassified();

  await bounceTrackingProtection.testRunPurgeBounceTrackers();
  let purgeLog = bounceTrackingProtection.testGetRecentlyPurgedTrackers({});
  Assert.equal(purgeLog.length, 1, "Should have one tracker in purge log.");
  Assert.equal(
    purgeLog[0].bounceTrackingRecord.initialHost,
    SITE_A,
    "initialHost should be the top level site, not the framebusting frame's."
  );
});

// A frame nested inside another cross-site frame must resolve all the way to the
// top level document.
add_task(async function test_nested_frame_link_top_target() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let outerFrameBC = await insertIframeAndWaitForLoad(
      browser,
      getStartURL(ORIGIN_B)
    );
    let innerFrameBC = await insertIframeAndWaitForLoad(
      outerFrameBC,
      getStartURL(ORIGIN_TRACKER)
    );

    let targetURL = new URL(getStartURL(ORIGIN_A));
    let bounceURL = getBounceURL({
      bounceType: "server",
      bounceOrigin: ORIGIN_TRACKER,
      targetURL,
    });

    let targetLoaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      targetURL.href
    );
    await navigateLinkClick(innerFrameBC, bounceURL, { linkTarget: "_top" });
    await targetLoaded;

    let recordedBounces = waitForRecordBounces(browser, 0);
    await navigateLinkClick(browser, getEndURL());
    await recordedBounces;
  });

  assertTrackerClassified();

  // Pins that resolution walked past the intermediate ORIGIN_B frame rather than
  // stopping at it.
  await bounceTrackingProtection.testRunPurgeBounceTrackers();
  let purgeLog = bounceTrackingProtection.testGetRecentlyPurgedTrackers({});
  Assert.equal(purgeLog.length, 1, "Should have one tracker in purge log.");
  Assert.equal(
    purgeLog[0].bounceTrackingRecord.initialHost,
    SITE_A,
    "initialHost should be the top level site, not the intermediate frame's."
  );
});

// Negative control: a same-site frame bouncing the top level through its own
// site must stay exempt, because initialHost and the bouncing site are the same
// site. Guards against over-classification.
add_task(async function test_same_site_frame_not_classified() {
  await runFrameInitiatedBounce({
    frameOrigin: ORIGIN_A,
    bounceType: "server",
    bounceOrigin: ORIGIN_A,
    trigger: (frameBC, bounceURL) =>
      navigateLinkClick(frameBC, bounceURL, { linkTarget: "_top" }),
  });

  assertNothingClassified();
});

// Negative control: the frame busts the top level straight to a third site
// without hopping through its own origin, so it is not in the bounce set at all.
add_task(async function test_frame_navigates_to_third_site_not_classified() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let frameBC = await insertIframeAndWaitForLoad(
      browser,
      getStartURL(ORIGIN_TRACKER)
    );

    let targetURL = new URL(getStartURL(ORIGIN_B));
    let targetLoaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      targetURL.href
    );
    await navigateLinkClick(frameBC, targetURL, { linkTarget: "_top" });
    await targetLoaded;

    let recordedBounces = waitForRecordBounces(browser, 0);
    await navigateLinkClick(browser, getEndURL());
    await recordedBounces;
  });

  assertNothingClassified();
});

// Negative control: the frame navigates the top level to its own site and the
// user stays there, so the tracker is the extended navigation's finalHost and
// remains exempt.
add_task(async function test_frame_navigates_to_own_site_user_stays() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let frameBC = await insertIframeAndWaitForLoad(
      browser,
      getStartURL(ORIGIN_TRACKER)
    );

    let targetURL = new URL(getStartURL(ORIGIN_TRACKER));
    let targetLoaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      targetURL.href
    );
    await navigateLinkClick(frameBC, targetURL, { linkTarget: "_top" });
    await targetLoaded;

    let recordedBounces = waitForRecordBounces(browser, 0);
    await navigateLinkClick(browser, getEndURL());
    await recordedBounces;
  });

  assertNothingClassified();
});

// A frame cannot name itself by injecting the navigation into an empty popup it
// opened. The popup's initial about:blank inherits the frame's principal, so
// anything reading the popup's own document would resolve to the tracker.
add_task(async function test_frame_cannot_self_nominate_via_popup_write() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let frameBC = await insertIframeAndWaitForLoad(
      browser,
      getStartURL(ORIGIN_TRACKER)
    );

    let targetURL = new URL(getStartURL(ORIGIN_A));
    let bounceURL = getBounceURL({
      bounceType: "server",
      bounceOrigin: ORIGIN_TRACKER,
      targetURL,
    });

    let popupPromise = BrowserTestUtils.waitForNewTab(
      gBrowser,
      targetURL.href,
      true
    );
    await SpecialPowers.spawn(frameBC, [bounceURL.href], url => {
      SpecialPowers.wrap(content.document).notifyUserGestureActivation();
      content.document.userInteractionForTesting();
      let script = content.document.createElement("script");
      script.textContent = `
        let w = window.open();
        w.document.write('<script>location.href = ${JSON.stringify(url)};<\\/script>');
      `;
      content.document.body.appendChild(script);
    });
    let popupTab = await popupPromise;

    let endURL = new URL(getStartURL(ORIGIN_A) + "?end");
    let endLoaded = BrowserTestUtils.browserLoaded(
      popupTab.linkedBrowser,
      false,
      endURL.href
    );
    let recordedBounces = waitForRecordBounces(popupTab.linkedBrowser, 0);
    await navigateLinkClick(popupTab.linkedBrowser, endURL);
    await endLoaded;
    await recordedBounces;
    await BrowserTestUtils.removeTab(popupTab);
  });

  assertTrackerClassified();

  await bounceTrackingProtection.testRunPurgeBounceTrackers();
  let purgeLog = bounceTrackingProtection.testGetRecentlyPurgedTrackers({});
  Assert.equal(purgeLog.length, 1, "Should have one tracker in purge log.");
  Assert.equal(
    purgeLog[0].bounceTrackingRecord.initialHost,
    SITE_A,
    "initialHost should be the embedder, not the frame which wrote the popup."
  );
});

// Severing the opener must not buy an exemption. A popup can clear window.opener
// before navigating, which leaves no document and no opener to attribute, so the
// initial host stays empty and exempts nothing.
add_task(async function test_frame_cannot_self_nominate_by_severing_opener() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let frameBC = await insertIframeAndWaitForLoad(
      browser,
      getStartURL(ORIGIN_TRACKER)
    );

    let targetURL = new URL(getStartURL(ORIGIN_A));
    let bounceURL = getBounceURL({
      bounceType: "server",
      bounceOrigin: ORIGIN_TRACKER,
      targetURL,
    });

    let popupPromise = BrowserTestUtils.waitForNewTab(
      gBrowser,
      targetURL.href,
      true
    );
    await SpecialPowers.spawn(frameBC, [bounceURL.href], url => {
      SpecialPowers.wrap(content.document).notifyUserGestureActivation();
      content.document.userInteractionForTesting();
      let script = content.document.createElement("script");
      script.textContent = `
        let w = window.open();
        w.document.write('<script>window.opener = null; location.href = ${JSON.stringify(
          url
        )};<\\/script>');
      `;
      content.document.body.appendChild(script);
    });
    let popupTab = await popupPromise;

    let endURL = new URL(getStartURL(ORIGIN_A) + "?end");
    let endLoaded = BrowserTestUtils.browserLoaded(
      popupTab.linkedBrowser,
      false,
      endURL.href
    );
    let recordedBounces = waitForRecordBounces(popupTab.linkedBrowser, 0);
    await navigateLinkClick(popupTab.linkedBrowser, endURL);
    await endLoaded;
    await recordedBounces;
    await BrowserTestUtils.removeTab(popupTab);
  });

  // The tracker must still be classified: an empty initial host exempts nobody.
  assertTrackerClassified();
});

// Regression guard: a top level link click keeps attributing initialHost to the
// page which was navigated away from, so a bounce from it is still classified
// and the top level site itself is still exempt.
add_task(async function test_top_level_link_click_unchanged() {
  bounceTrackingProtection.clearAll();

  await BrowserTestUtils.withNewTab(getStartURL(ORIGIN_A), async browser => {
    let targetURL = new URL(getStartURL(ORIGIN_B));
    let bounceURL = getBounceURL({ bounceType: "server", targetURL });

    let targetLoaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      targetURL.href
    );
    await navigateLinkClick(browser, bounceURL);
    await targetLoaded;

    let recordedBounces = waitForRecordBounces(browser, 0);
    await navigateLinkClick(browser, getEndURL());
    await recordedBounces;
  });

  assertTrackerClassified();

  await bounceTrackingProtection.testRunPurgeBounceTrackers();
  let purgeLog = bounceTrackingProtection.testGetRecentlyPurgedTrackers({});
  Assert.equal(purgeLog.length, 1, "Should have one tracker in purge log.");
  Assert.equal(
    purgeLog[0].bounceTrackingRecord.initialHost,
    SITE_A,
    "initialHost for a top level initiated navigation is unchanged."
  );
});
