/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// End-to-end browser smoke test for Search Suggestion OHTTP sessions in the
// search bar. More comprehensive tests are in test_quicksuggest_merinoSessions.js.
// See also ../quicksuggest/browser/browser_quicksuggest_merinoSessions.js.

"use strict";

const ENGINE_ID = "suggestions-engine-test";
const CONFIG = [
  {
    identifier: ENGINE_ID,
    base: {
      name: "other",
      urls: {
        suggestions: {
          base: "https://example.com",
          params: [
            {
              name: "parameter",
              value: "135246",
            },
          ],
          searchTermParamName: "suggest",
        },
      },
    },
  },
];

const { MerinoTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MerinoTestUtils.sys.mjs"
);
const { ObliviousHTTP } = ChromeUtils.importESModule(
  "resource://gre/modules/ObliviousHTTP.sys.mjs"
);
const { SearchSuggestionController } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchSuggestionController.sys.mjs"
);

const searchPopup = document.getElementById("PopupSearchAutoComplete");
let searchBar;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.search.suggest.enabled", true],
      ["browser.urlbar.suggest.searches", true],
      ["browser.search.suggest.ohttp.featureGate", true],
      ["browser.urlbar.merino.ohttpConfigURL", "https://example.com/config"],
      ["browser.urlbar.merino.ohttpRelayURL", "https://example.com/relay"],
      ["browser.urlbar.merino.endpointURL", "https://example.com/endpoint"],
    ],
  });

  await gCUITestUtils.addSearchBar();
  await clearSearchbarHistory();

  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();
  await UrlbarTestUtils.formHistory.clear();

  await SearchTestUtils.updateRemoteSettingsConfig(CONFIG);

  SearchSuggestionController.oHTTPEngineId = ENGINE_ID;

  sinon.stub(ObliviousHTTP, "getOHTTPConfig").resolves({});
  sinon
    .stub(ObliviousHTTP, "ohttpRequest")
    .callsFake((relayUrl, config, url) => {
      return {
        status: 200,
        json: async () =>
          Promise.resolve({
            suggestions: [
              {
                title: "",
                url: "https://merino.services.mozilla.com",
                provider: "google_suggest",
                is_sponsored: false,
                score: 1,
                custom_details: {
                  google_suggest: {
                    suggestions: [new URL(url).searchParams.get("q"), []],
                  },
                },
              },
            ],
          }),
        ok: true,
      };
    });

  searchBar = window.document.getElementById("searchbar");

  registerCleanupFunction(async () => {
    await clearSearchbarHistory();
    gCUITestUtils.removeSearchBar();
    sinon.restore();
  });
});

async function checkAndClearRequests(expectedParams) {
  await TestUtils.waitForCondition(
    () => ObliviousHTTP.ohttpRequest.callCount == 1,
    "Should have recieved an OHTTP search"
  );

  Assert.equal(
    ObliviousHTTP.ohttpRequest.callCount,
    1,
    "Should request via OHTTP once per search"
  );
  let args = ObliviousHTTP.ohttpRequest.firstCall.args;
  Assert.deepEqual(
    args[0],
    "https://example.com/relay",
    "Should have called the Relay URL"
  );
  let url = new URL(args[2]);
  Assert.deepEqual(
    url.origin + url.pathname,
    Services.prefs.getCharPref("browser.urlbar.merino.endpointURL"),
    "Should have the correct URL base"
  );
  for (let [paramName, paramValue] of Object.entries(expectedParams)) {
    Assert.equal(
      url.searchParams.get(paramName),
      paramValue,
      `Should have the expected parameter value for ${paramName}`
    );
  }

  ObliviousHTTP.ohttpRequest.resetHistory();
}

// In a single engagement, all requests should use the same session ID and the
// sequence number should be incremented.
add_task(async function singleEngagement() {
  for (let i = 0; i < 3; i++) {
    let searchString = "search" + i;
    await searchInSearchbar(searchString, window, i != 0);

    await checkAndClearRequests({
      [MerinoTestUtils.SEARCH_PARAMS.QUERY]: searchString,
      [MerinoTestUtils.SEARCH_PARAMS.SEQUENCE_NUMBER]: i,
    });
  }

  // End the engagement to reset the session for the next test.
  gURLBar.focus();
});

// In a single engagement, all requests should use the same session ID and the
// sequence number should be incremented. This task closes the panel between
// searches but keeps the input focused, so the engagement should not end.
add_task(async function singleEngagement_panelClosed() {
  for (let i = 0; i < 3; i++) {
    let searchString = "search" + i;
    await searchInSearchbar(searchString, window);

    await checkAndClearRequests({
      [MerinoTestUtils.SEARCH_PARAMS.QUERY]: searchString,
      [MerinoTestUtils.SEARCH_PARAMS.SEQUENCE_NUMBER]: i,
    });

    let promise = promiseEvent(searchPopup, "popuphidden");
    EventUtils.synthesizeKey("KEY_Escape");
    searchPopup.hidePopup();
    await promise;
    Assert.ok(searchBar.textbox.focused, "Input remains focused");
  }

  // End the engagement to reset the session for the next test.
  searchBar.blur();
});

// New engagements should not use the same session ID as previous engagements
// and the sequence number should be reset. This task completes each engagement
// successfully.
add_task(async function manyEngagements_engagement() {
  for (let i = 0; i < 3; i++) {
    // Open a new tab since we'll load the mock default search engine page.
    await BrowserTestUtils.withNewTab("about:blank", async () => {
      let searchString = "search" + i;
      await searchInSearchbar(searchString, window);

      await checkAndClearRequests({
        [MerinoTestUtils.SEARCH_PARAMS.QUERY]: searchString,
        [MerinoTestUtils.SEARCH_PARAMS.SEQUENCE_NUMBER]: 0,
      });

      // Press enter on the heuristic result to load the search engine page and
      // complete the engagement.
      let loadPromise = BrowserTestUtils.browserLoaded(
        gBrowser.selectedBrowser
      );
      EventUtils.synthesizeKey("KEY_Enter");
      await loadPromise;
    });
  }
});

// New engagements should not use the same session ID as previous engagements
// and the sequence number should be reset. This task abandons each engagement.
add_task(async function manyEngagements_abandonment() {
  for (let i = 0; i < 3; i++) {
    let searchString = "search" + i;
    await searchInSearchbar(searchString, window);

    await checkAndClearRequests({
      [MerinoTestUtils.SEARCH_PARAMS.QUERY]: searchString,
      [MerinoTestUtils.SEARCH_PARAMS.SEQUENCE_NUMBER]: 0,
    });

    // Focus the URLBar to abandon the engagement.
    gURLBar.focus();
  }
});
