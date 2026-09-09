/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// A rich suggestion's icon reaches Firefox as a data: URL from the search
// provider. The address bar wraps it in `moz-remote-image:`, which decodes it
// in a content process so the parent doesn't (bug 2012436). A `<moz-urlbar>`
// in a content document already decodes in a content process, so it takes the
// icon as it is. `browser_rich_suggestions.js` covers the wrapped case.

"use strict";

// The icon richSuggestionEngine.sjs sends.
const ICON_DATA_URL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

const CONFIG = [
  {
    recordType: "engine",
    identifier: "rich",
    base: {
      name: "rich",
      urls: {
        search: {
          base: "https://example.com",
          searchTermParamName: "q",
        },
        suggestions: {
          base: "https://example.com/browser/browser/components/urlbar/tests/browser-newtab/richSuggestionEngine.sjs",
          method: "GET",
          searchTermParamName: "query",
        },
      },
    },
    variants: [{ environment: { allRegionsAndLocales: true } }],
  },
  {
    recordType: "defaultEngines",
    globalDefault: "rich",
    specificDefaults: [],
  },
  { recordType: "engineOrders", orders: [] },
];

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.suggest.searches", true],
      ["browser.search.suggest.enabled", true],
      ["browser.urlbar.richSuggestions.featureGate", true],
      ["browser.urlbar.recentsearches.featureGate", false],
    ],
  });
  await SearchTestUtils.updateRemoteSettingsConfig(CONFIG);
});

add_task(async function iconLoadsFromItsOwnUrl() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser: tab.linkedBrowser,
    value: "test",
  });
  let icon = await NewtabSearchbarTestUtils.waitForRowIcon(
    tab.linkedBrowser,
    "test suggestion",
    { notSrc: UrlbarShared.ICON.DEFAULT }
  );

  Assert.equal(
    icon.src,
    ICON_DATA_URL,
    "The page loads the icon by the URL the provider sent"
  );
  Assert.ok(icon.loaded, "The icon loaded");

  BrowserTestUtils.removeTab(tab);
});

// Nothing constrains what a search provider puts in the icon field. The page
// loads the URL under its own content policies, so a scheme it can't load
// produces no image.
add_task(async function unexpectedSchemeDoesNotLoad() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  for (let [query, iconUrl] of Object.entries({
    javascript: "javascript:alert(1)",
    file: "file:///etc/passwd",
    // about:newtab's CSP allows img-src https:, data:, blob: and chrome: only,
    // so http is refused there rather than by the address bar.
    // eslint-disable-next-line sdl/no-insecure-url
    http: "http://example.com/favicon.ico",
  })) {
    await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
      browser: tab.linkedBrowser,
      value: query,
    });
    let icon = await NewtabSearchbarTestUtils.waitForRowIcon(
      tab.linkedBrowser,
      `${query} suggestion`,
      { src: iconUrl }
    );
    Assert.ok(!icon.loaded, `The page doesn't load ${iconUrl}`);
  }

  BrowserTestUtils.removeTab(tab);
});
