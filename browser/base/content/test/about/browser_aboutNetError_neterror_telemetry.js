/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const NET_ERROR_PAGE = "https://does-not-exist.test";
const BAD_CERT = "https://expired.example.com/";

async function getLoadEvents() {
  await Services.fog.testFlushAllChildren();
  return Glean.securityUiNeterror.loadAboutneterror.testGetValue();
}

async function getCertErrorLoadEvents() {
  await Services.fog.testFlushAllChildren();
  return Glean.securityUiCerterror.loadAboutcerterror.testGetValue();
}

// -- Felt Privacy path (default) --

// Test: load_aboutneterror fires for a DNS error (top-level)
add_task(async function test_feltprivacy_neterror_load() {
  Services.fog.testResetFOG();

  let pageLoaded;
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    () => {
      gBrowser.selectedTab = BrowserTestUtils.addTab(gBrowser, NET_ERROR_PAGE);
      let browser = gBrowser.selectedBrowser;
      pageLoaded = BrowserTestUtils.waitForErrorPage(browser);
    },
    false
  );
  await pageLoaded;

  let events = await TestUtils.waitForCondition(
    getLoadEvents,
    "Waiting for load_aboutneterror Glean event"
  );

  Assert.equal(events.length, 1, "Exactly one load event recorded");
  Assert.equal(events[0].extra.is_frame, "false", "Not in an iframe");
  Assert.equal(
    events[0].extra.value,
    "dnsNotFound",
    "Error code is dnsNotFound"
  );

  BrowserTestUtils.removeTab(tab);
});

// Test: load_aboutneterror fires with is_frame=true for iframe errors
add_task(async function test_feltprivacy_neterror_load_iframe() {
  Services.fog.testResetFOG();

  let tab = await openErrorPage(NET_ERROR_PAGE, true);

  let events = await TestUtils.waitForCondition(
    getLoadEvents,
    "Waiting for load_aboutneterror Glean event in iframe"
  );

  Assert.equal(events.length, 1, "Exactly one load event recorded");
  Assert.equal(events[0].extra.is_frame, "true", "Recorded as iframe");

  BrowserTestUtils.removeTab(tab);
});

// Test: cert errors do NOT fire load_aboutneterror
add_task(async function test_feltprivacy_certerror_no_neterror() {
  Services.fog.testResetFOG();

  let tab = await openErrorPage(BAD_CERT, false);

  // Wait for the cert error telemetry to confirm the page fully loaded
  // and telemetry was processed, then verify no neterror event fired.
  await TestUtils.waitForCondition(
    getCertErrorLoadEvents,
    "Waiting for cert error load event to confirm page loaded"
  );

  let events = Glean.securityUiNeterror.loadAboutneterror.testGetValue();
  Assert.equal(events, null, "No neterror event for cert errors");

  BrowserTestUtils.removeTab(tab);
});

// -- Legacy path (felt-privacy disabled) --

// Test: load_aboutneterror fires on the legacy path for a DNS error
add_task(async function test_legacy_neterror_load() {
  await SpecialPowers.pushPrefEnv({
    set: [["security.certerrors.felt-privacy-v1", false]],
  });
  Services.fog.testResetFOG();

  let pageLoaded;
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    () => {
      gBrowser.selectedTab = BrowserTestUtils.addTab(gBrowser, NET_ERROR_PAGE);
      let browser = gBrowser.selectedBrowser;
      pageLoaded = BrowserTestUtils.waitForErrorPage(browser);
    },
    false
  );
  await pageLoaded;

  let events = await TestUtils.waitForCondition(
    getLoadEvents,
    "Waiting for load_aboutneterror Glean event (legacy path)"
  );

  Assert.equal(events.length, 1, "Exactly one load event recorded");
  Assert.equal(events[0].extra.is_frame, "false", "Not in an iframe");
  Assert.equal(
    events[0].extra.value,
    "dnsNotFound",
    "Error code is dnsNotFound"
  );

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

// Test: cert errors do NOT fire load_aboutneterror on the legacy path
add_task(async function test_legacy_certerror_no_neterror() {
  await SpecialPowers.pushPrefEnv({
    set: [["security.certerrors.felt-privacy-v1", false]],
  });
  Services.fog.testResetFOG();

  let tab = await openErrorPage(BAD_CERT, false);

  // Wait for the cert error telemetry to confirm the page fully loaded
  // and telemetry was processed, then verify no neterror event fired.
  await TestUtils.waitForCondition(
    getCertErrorLoadEvents,
    "Waiting for cert error load event to confirm page loaded (legacy)"
  );

  let events = Glean.securityUiNeterror.loadAboutneterror.testGetValue();
  Assert.equal(events, null, "No neterror event for cert errors (legacy)");

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
