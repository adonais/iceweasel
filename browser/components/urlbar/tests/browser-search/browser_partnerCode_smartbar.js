/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that searches from the Smartbar load and report the partner code and
 * telemetry id for the Smartbar search access point.
 */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  AIWindowTestUtils: "resource://testing-common/AIWindowTestUtils.sys.mjs",
  IntentClassifier:
    "moz-src:///browser/components/aiwindow/models/IntentClassifier.sys.mjs",
});

const SEARCH_URL =
  "https://example.org/browser/browser/components/urlbar/tests/browser-search/dummy_page.html";

// Per-SAP partner codes are only supported by search-config-v3.
const EXPECTED = SearchUtils.configV3FeatureGate
  ? { partnerCode: "smartbarcode", telemetrySuffix: "-smartbarsx" }
  : { partnerCode: "defaultcode", telemetrySuffix: "" };

add_setup(async function () {
  AIWindowTestUtils.init(this, window);

  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.search.suggest.enabled", false],
      ["browser.urlbar.suggest.searches", false],
      ["browser.smartwindow.enabled", true],
      ["browser.smartwindow.endpoint", "http://localhost:0/v1"],
      ["browser.smartwindow.firstrun.hasCompleted", true],
      // The Urlbar actor is not available in the AI window, so the Smartbar
      // can't use the message path.
      ["browser.urlbar.ipc.chromeMessagePassing", false],
    ],
  });

  let intentStub = sinon.stub(IntentClassifier, "_createEngine").resolves({
    run() {
      return [
        { label: "search", score: 0.95 },
        { label: "chat", score: 0.05 },
      ];
    },
  });
  registerCleanupFunction(async () => {
    intentStub.restore();
    await PlacesUtils.history.clear();
    await UrlbarTestUtils.formHistory.clear();
  });

  let partnerDetails;
  if (SearchUtils.configV3FeatureGate) {
    partnerDetails = {
      partner: {
        default: { code: "defaultcode" },
        smartbar: { code: "smartbarcode", telemetrySuffix: "smartbarsx" },
      },
    };
  } else {
    partnerDetails = { partnerCode: "defaultcode" };
  }

  await SearchTestUtils.updateRemoteSettingsConfig([
    {
      identifier: "engine",
      base: {
        urls: {
          search: {
            base: SEARCH_URL,
            params: [{ name: "pc", value: "{partnerCode}" }],
            searchTermParamName: "s",
          },
        },
        ...partnerDetails,
      },
    },
  ]);
});

/**
 * Gets the Smartbar in an AI window's tab, once it has rendered.
 *
 * @param {MozBrowser} browser
 * @returns {Promise<HTMLElement>}
 */
function getSmartbar(browser) {
  return TestUtils.waitForCondition(
    () =>
      browser.contentDocument
        ?.querySelector("ai-window")
        ?.shadowRoot?.querySelector("#ai-window-smartbar"),
    "Wait for the Smartbar to be rendered"
  );
}

async function typeInSmartbar(browser, text) {
  let smartbar = await getSmartbar(browser);
  smartbar.inputField.focus();
  EventUtils.sendString(text, browser.contentWindow);
  await smartbar.lastQueryContextPromise;
}

async function submitSmartbar(browser, { useButton = false } = {}) {
  let smartbar = await getSmartbar(browser);
  if (useButton) {
    smartbar
      .querySelector("input-cta")
      .shadowRoot.querySelector("moz-button")
      .shadowRoot.querySelector("button")
      .click();
  } else {
    smartbar.inputField.focus();
    EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  }
}

async function assertSearch(win) {
  let browser;
  await TestUtils.waitForCondition(() => {
    browser = win.gBrowser.browsers.find(b =>
      b.currentURI?.spec.startsWith(SEARCH_URL)
    );
    return browser;
  }, "Wait for the search to load");

  Assert.equal(
    URL.fromURI(browser.currentURI).searchParams.get("pc"),
    EXPECTED.partnerCode,
    "Should have loaded the search with the expected partner code"
  );
  await SearchUITestUtils.assertSAPTelemetry({
    engineId: "engine",
    engineName: "engine",
    partnerCode: EXPECTED.partnerCode,
    source: "smartbar",
    telemetrySuffix: EXPECTED.telemetrySuffix,
    count: 1,
  });
}

add_task(async function test_detected_search_action() {
  clearSAPTelemetry();
  let win = await AIWindowTestUtils.openReadyAIWindow();
  let browser = win.gBrowser.selectedBrowser;

  await typeInSmartbar(browser, "detected search");
  await AIWindowTestUtils.waitForSmartbarAction(browser, "search");
  await submitSmartbar(browser, { useButton: true });

  await assertSearch(win);

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_explicit_search_action() {
  clearSAPTelemetry();
  let win = await AIWindowTestUtils.openReadyAIWindow();
  let browser = win.gBrowser.selectedBrowser;

  await typeInSmartbar(browser, "explicit search");
  await AIWindowTestUtils.selectExplicitSmartbarAction(browser, "search");
  await AIWindowTestUtils.waitForSmartbarAction(browser, "search");
  await submitSmartbar(browser);

  await assertSearch(win);

  await BrowserTestUtils.closeWindow(win);
});
