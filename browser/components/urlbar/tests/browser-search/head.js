/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  PromptTestUtils: "resource://testing-common/PromptTestUtils.sys.mjs",
  SearchUtils: "moz-src:///toolkit/components/search/SearchUtils.sys.mjs",
  UrlbarPrefs: "moz-src:///browser/components/urlbar/UrlbarPrefs.sys.mjs",
  UrlbarSearchUtils:
    "moz-src:///browser/components/urlbar/UrlbarSearchUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(this, "SearchUITestUtils", () => {
  let { SearchUITestUtils } = ChromeUtils.importESModule(
    "resource://testing-common/SearchUITestUtils.sys.mjs"
  );
  SearchUITestUtils.init(this);
  return SearchUITestUtils;
});

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/browser/components/urlbar/tests/browser/head-common.js",
  this
);

registerCleanupFunction(async () => {
  await UrlbarTestUtils.promisePopupClose(window);
});

/**
 * Puts all CustomizableUI widgetry back to their default locations, and
 * then fires the `aftercustomization` toolbox event so that UrlbarInput
 * knows to reinitialize itself.
 *
 * @param {window} [win=window]
 *   The top-level browser window to fire the `aftercustomization` event in.
 */
function resetCUIAndReinitUrlbarInput(win = window) {
  CustomizableUI.reset();
  CustomizableUI.dispatchToolboxEvent("aftercustomization", {}, win);
}

/**
 * Clears the SAP telemetry probes (SEARCH_COUNTS and all of Glean).
 */
function clearSAPTelemetry() {
  TelemetryTestUtils.getAndClearKeyedHistogram("SEARCH_COUNTS");
  Services.fog.testResetFOG();
}
