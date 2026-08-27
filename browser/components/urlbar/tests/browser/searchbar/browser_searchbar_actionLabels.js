/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The searchbar doesn't show action labels like "Search with Example", so it
// shouldn't set them either.

const QUERY = "kitten";

let searchbar;

add_setup(async function () {
  searchbar = document.getElementById("searchbar-new");
  await SearchTestUtils.updateRemoteSettingsConfig([{ identifier: "engine" }]);

  // This engine suggests QUERY + "foo" and QUERY + "bar", so we get
  // non-heuristic search results in addition to the heuristic one.
  let engine = await SearchTestUtils.installOpenSearchEngine({
    url: getRootDirectory(gTestPath) + "../searchSuggestionEngine.xml",
  });
  await SearchService.setDefault(engine, SearchService.CHANGE_REASON.UNKNOWN);
});

add_task(async function test_searchbar() {
  await SearchbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: QUERY,
  });

  let resultCount = SearchbarTestUtils.getResultCount(window);
  Assert.greater(resultCount, 1, "There's more than the heuristic result");

  for (let i = 0; i < resultCount; i++) {
    let details = await SearchbarTestUtils.getDetailsOfResultAt(window, i);
    Assert.equal(
      details.type,
      UrlbarShared.RESULT_TYPE.SEARCH,
      `Result at index ${i} is a search result`
    );
    Assert.equal(
      details.displayed.action,
      "",
      `Result at index ${i} has no action label`
    );
    Assert.ok(
      !details.element.row.hasAttribute("has-action"),
      `Result at index ${i} isn't marked as having an action`
    );
    Assert.ok(
      BrowserTestUtils.isHidden(details.element.action),
      `Action of result at index ${i} is hidden`
    );
    Assert.ok(
      !UrlbarTestUtils.isSeparatorVisible(details.element.separator),
      `Title separator of result at index ${i} is hidden`
    );
  }

  await SearchbarTestUtils.promisePopupClose(window, () => searchbar.blur());
  searchbar.handleRevert();
});

// A dynamic result's view template can declare an action element of its own,
// which the searchbar shouldn't show either.
add_task(async function test_dynamicResult() {
  let provider = new UrlbarTestUtils.TestProvider({
    results: [
      new UrlbarResult({
        type: UrlbarShared.RESULT_TYPE.DYNAMIC,
        source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
        suggestedIndex: 1,
        payload: { dynamicType: "actionLabels" },
      }),
    ],
    getViewTemplate: () => ({
      children: [
        {
          name: "title",
          tag: "span",
          classList: ["urlbarView-title"],
        },
        {
          name: "action",
          tag: "span",
          classList: ["urlbarView-action"],
        },
      ],
    }),
    getViewUpdate: () => ({
      title: { textContent: "Dynamic result" },
      action: { textContent: "Some action text" },
    }),
  });

  let providersManager = ProvidersManager.getInstanceForSap("searchbar");
  providersManager.registerProvider(provider);

  try {
    await SearchbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: QUERY,
    });

    let details = await SearchbarTestUtils.getDetailsOfResultAt(window, 1);
    Assert.equal(
      details.type,
      UrlbarShared.RESULT_TYPE.DYNAMIC,
      "The dynamic result is present"
    );
    Assert.ok(
      !details.element.row.hasAttribute("has-action"),
      "The dynamic result isn't marked as having an action"
    );
    Assert.ok(
      BrowserTestUtils.isHidden(details.element.action),
      "Action of the dynamic result is hidden"
    );

    await SearchbarTestUtils.promisePopupClose(window, () => searchbar.blur());
    searchbar.handleRevert();
  } finally {
    providersManager.unregisterProvider(provider);
  }
});

add_task(async function test_urlbar() {
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: QUERY,
  });

  let details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.equal(
    details.type,
    UrlbarShared.RESULT_TYPE.SEARCH,
    "First result is a search result"
  );
  Assert.ok(
    details.displayed.action.includes(details.searchParams.engine),
    "The address bar labels the result with the engine name"
  );

  await UrlbarTestUtils.promisePopupClose(window);
});
