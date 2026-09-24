/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// Picking a search suggestion from an engine that submits by POST should send
// the search terms as post data.

"use strict";

const POST_URL = `${TEST_BASE_URL}print_postdata.sjs`;
const SUGGEST_URL = `${TEST_BASE_URL}searchSuggestionEngine.sjs`;

add_setup(async function () {
  await SearchTestUtils.updateRemoteSettingsConfig([
    {
      identifier: "post",
      base: {
        urls: {
          search: {
            base: POST_URL,
            method: "POST",
            searchTermParamName: "q",
          },
          suggestions: {
            base: SUGGEST_URL,
            method: "GET",
            searchTermParamName: "query",
          },
        },
      },
    },
  ]);
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.suggest.searches", true]],
  });
  await UrlbarTestUtils.formHistory.clear();

  registerCleanupFunction(async () => {
    await PlacesUtils.history.clear();
    await UrlbarTestUtils.formHistory.clear();
  });
});

add_task(async function pickSuggestion() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "foo",
    });

    let index = -1;
    let suggestion;
    for (let i = 0; i < UrlbarTestUtils.getResultCount(window); i++) {
      let details = await UrlbarTestUtils.getDetailsOfResultAt(window, i);
      if (
        details.type == UrlbarShared.RESULT_TYPE.SEARCH &&
        details.searchParams.suggestion
      ) {
        index = i;
        suggestion = details.searchParams.suggestion;
        break;
      }
    }
    Assert.greater(index, -1, "Found a search suggestion");

    let loaded = BrowserTestUtils.browserLoaded(browser, false, POST_URL);
    for (let i = 0; i < index; i++) {
      EventUtils.synthesizeKey("KEY_ArrowDown");
    }
    await UrlbarTestUtils.promisePopupClose(window, () => {
      EventUtils.synthesizeKey("KEY_Enter");
    });
    await loaded;

    Assert.equal(
      await SpecialPowers.spawn(
        browser,
        [],
        () => content.document.body.textContent
      ),
      `q=${suggestion}`,
      "The engine was posted the suggestion"
    );
  });
});
