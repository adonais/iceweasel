/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.scotchBonnet.enableOverride", false]],
  });

  let results = [
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.URL,
      source: UrlbarShared.RESULT_SOURCE.HISTORY,
      heuristic: true,
      payload: {
        url: "http://mozilla.org/1",
        helpUrl: "http://example.com/",
        isBlockable: true,
        blockL10n: { id: "urlbar-result-menu-remove-from-history2" },
      },
    }),
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.URL,
      source: UrlbarShared.RESULT_SOURCE.HISTORY,
      payload: {
        url: "http://mozilla.org/2",
        helpUrl: "http://example.com/",
        isBlockable: true,
        blockL10n: { id: "urlbar-result-menu-remove-from-history2" },
      },
    }),
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.TIP,
      source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
      payload: {
        helpUrl: "http://example.com/",
        type: "test",
        titleL10n: { id: "urlbar-search-tips-confirm" },
        buttons: [
          {
            url: "http://example.com/",
            l10n: { id: "urlbar-search-tips-confirm" },
          },
        ],
      },
    }),
  ];

  const EXPECTED_SELECTION_COUNT = 6;
  let selectionCount = 0;
  let allSelected = Promise.withResolvers();
  let provider = new UrlbarTestUtils.TestProvider({
    results,
    priority: 1,
    onSelection: () => {
      if (++selectionCount == EXPECTED_SELECTION_COUNT) {
        allSelected.resolve();
      }
    },
  });
  let providersManager = ProvidersManager.getInstanceForSap("urlbar");
  providersManager.registerProvider(provider);

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "test",
  });

  EventUtils.synthesizeKey("KEY_Tab", {
    repeat: 5,
  });
  EventUtils.synthesizeKey("KEY_ArrowDown");
  ok(
    UrlbarTestUtils.getOneOffSearchButtons(window).selectedButton,
    "a one off button is selected"
  );

  await allSelected.promise;
  Assert.equal(
    selectionCount,
    EXPECTED_SELECTION_COUNT,
    "Number of elements selected in the view."
  );
  providersManager.unregisterProvider(provider);
});
