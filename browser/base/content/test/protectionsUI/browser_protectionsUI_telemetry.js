/*
 * Test telemetry for Tracking Protection
 */

const { StartupTelemetry } = ChromeUtils.importESModule(
  "moz-src:///browser/components/StartupTelemetry.sys.mjs"
);

const PREF = "privacy.trackingprotection.enabled";
const BENIGN_PAGE =
  // eslint-disable-next-line sdl/no-insecure-url
  "http://tracking.example.org/browser/browser/base/content/test/protectionsUI/benignPage.html";
const TRACKING_PAGE =
  // eslint-disable-next-line sdl/no-insecure-url
  "http://tracking.example.org/browser/browser/base/content/test/protectionsUI/trackingPage.html";

registerCleanupFunction(function () {
  UrlClassifierTestUtils.cleanupTestTrackers();
  Services.prefs.clearUserPref(PREF);
  Services.fog.testResetFOG();
});

function getShieldCounts() {
  // testGetValue() returns null until the first sample is recorded.
  return (
    Glean.contentblocking.trackingProtectionShield.testGetValue()?.values ?? {}
  );
}

add_setup(async function () {
  await UrlClassifierTestUtils.addTestTrackers();

  let TrackingProtection =
    gBrowser.documentGlobal.gProtectionsHandler.blockers.TrackingProtection;
  ok(TrackingProtection, "TP is attached to the browser window");
  ok(!TrackingProtection.enabled, "TP is not enabled");

  // The other tests in this directory share this browser instance and call
  // testResetFOG(), so the value recorded at startup is already gone by now.
  // Record it again rather than depending on the file running first.
  Services.fog.testResetFOG();
  StartupTelemetry.contentBlocking();
  // The labels are the strings "false" and "true", so this is the property
  // named false, not the boolean.
  is(
    Glean.contentblocking.trackingProtectionEnabled.false.testGetValue(),
    1,
    "TP was not enabled on start up"
  );
});

add_task(async function testShieldHistogram() {
  Services.prefs.setBoolPref(PREF, true);
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser);

  // Reset these to make counting easier
  Services.fog.testResetFOG();

  await BrowserTestUtils.loadURIString({
    browser: tab.linkedBrowser,
    uriString: BENIGN_PAGE,
  });
  is(getShieldCounts()[0], 1, "Page loads without tracking");

  await BrowserTestUtils.loadURIString({
    browser: tab.linkedBrowser,
    uriString: TRACKING_PAGE,
  });
  is(getShieldCounts()[0], 2, "Adds one more page load");
  is(getShieldCounts()[2], 1, "Counts one instance of the shield being shown");

  info("Disable TP for the page (which reloads the page)");
  let reloadURI = tab.linkedBrowser.currentURI.spec;
  let tabReloadPromise = BrowserTestUtils.loadURIString({
    browser: tab.linkedBrowser,
    uriString: reloadURI,
  });
  gProtectionsHandler.disableForCurrentPage();
  await tabReloadPromise;
  is(getShieldCounts()[0], 3, "Adds one more page load");
  is(
    getShieldCounts()[1],
    1,
    "Counts one instance of the shield being crossed out"
  );

  info("Re-enable TP for the page (which reloads the page)");
  reloadURI = tab.linkedBrowser.currentURI.spec;
  tabReloadPromise = BrowserTestUtils.loadURIString({
    browser: tab.linkedBrowser,
    uriString: reloadURI,
  });
  gProtectionsHandler.enableForCurrentPage();
  await tabReloadPromise;
  is(getShieldCounts()[0], 4, "Adds one more page load");
  is(
    getShieldCounts()[2],
    2,
    "Adds one more instance of the shield being shown"
  );

  gBrowser.removeCurrentTab();

  // Reset these to make counting easier for the next test
  Services.fog.testResetFOG();
});
