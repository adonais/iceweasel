/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

ChromeUtils.defineLazyGetter(this, "UrlbarTestUtils", () => {
  const { UrlbarTestUtils: module } = ChromeUtils.importESModule(
    "resource://testing-common/UrlbarTestUtils.sys.mjs"
  );
  module.init(this);
  return module;
});

add_setup(async function setup() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.trustPanel.featureGate", true]],
  });
  registerCleanupFunction(async () => {
    await PlacesUtils.history.clear();
  });
});

add_task(async function test_https() {
  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: "https://example.com",
    waitForLoad: true,
  });

  await UrlbarTestUtils.openTrustPanel(window);
  await UrlbarTestUtils.openTrustPanelSubview(
    window,
    "trustpanel-securityInformationView"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(
      document.getElementById("identity-popup-content-verifier-unknown")
    ),
    "custom root warning in sub panel is visible"
  );

  await UrlbarTestUtils.closeTrustPanel(window);
  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_http() {
  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    // eslint-disable-next-line @microsoft/sdl/no-insecure-url
    opening: "http://example.com",
    waitForLoad: true,
  });

  await UrlbarTestUtils.openTrustPanel(window);
  await UrlbarTestUtils.openTrustPanelSubview(
    window,
    "trustpanel-securityInformationView"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(
      document.getElementById("identity-popup-content-verifier-unknown")
    ),
    "custom root warning in sub panel is hidden"
  );

  await UrlbarTestUtils.closeTrustPanel(window);
  await BrowserTestUtils.removeTab(tab);
});
