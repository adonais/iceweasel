/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests browser quick suggestions.
 */

const REMOTE_SETTINGS_RESULTS = [
  QuickSuggestTestUtils.ampRemoteSettings({
    keywords: ["fra", "frab"],
    full_keywords: [["frab", 2]],
  }),
  QuickSuggestTestUtils.ampRemoteSettings({
    keywords: ["0.3"],
    full_keywords: [["0.3", 2]],
    score: 0.3,
    url: "https://example.com/amp/0.3",
  }),
  QuickSuggestTestUtils.ampRemoteSettings({
    keywords: ["1.0"],
    full_keywords: [["1.0", 2]],
    score: 1.0,
    url: "https://example.com/amp/1.0",
  }),
  QuickSuggestTestUtils.wikipediaRemoteSettings(),
];

const MERINO_NAVIGATIONAL_SUGGESTION = {
  url: "https://example.com/navigational-suggestion",
  title: "Navigational suggestion",
  provider: "top_picks",
  is_sponsored: false,
  score: 0.25,
  block_id: 0,
  is_top_pick: true,
};

const MERINO_DYNAMIC_WIKIPEDIA_SUGGESTION = {
  url: "https://example.com/dynamic-wikipedia",
  title: "Dynamic Wikipedia suggestion",
  click_url: "https://example.com/click",
  impression_url: "https://example.com/impression",
  advertiser: "dynamic-wikipedia",
  provider: "wikipedia",
  iab_category: "5 - Education",
  block_id: 1,
};

// Expected AMP icon sizes.
const AMP_ICON_SIZE_TOP_PICK_LARGE = 58;
const AMP_ICON_SIZE_TOP_PICK_SMALL = 28;
const AMP_ICON_SIZE_NON_TOP_PICK = 16;

// Trying to avoid timeouts in TV mode.
requestLongerTimeout(5);

add_setup(async function () {
  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();
  await UrlbarTestUtils.formHistory.clear();

  let isAmp = suggestion => suggestion.iab_category == "22 - Shopping";
  await QuickSuggestTestUtils.ensureQuickSuggestInit({
    remoteSettingsRecords: [
      {
        collection: QuickSuggestTestUtils.RS_COLLECTION.AMP,
        type: QuickSuggestTestUtils.RS_TYPE.AMP,
        attachment: REMOTE_SETTINGS_RESULTS.filter(isAmp),
      },
      {
        collection: QuickSuggestTestUtils.RS_COLLECTION.OTHER,
        type: QuickSuggestTestUtils.RS_TYPE.WIKIPEDIA,
        attachment: REMOTE_SETTINGS_RESULTS.filter(s => !isAmp(s)),
      },
    ],
    merinoSuggestions: [],
  });

  // Disable Merino so we trigger only remote settings suggestions.
  UrlbarPrefs.set("quicksuggest.online.enabled", false);

  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.suggest.engines", false]],
  });
});

// Tests a non-sponsored result.
add_task(async function nonSponsored() {
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "wikipedia",
  });
  await QuickSuggestTestUtils.assertIsQuickSuggest({
    window,
    index: 1,
    isSponsored: false,
    url: "https://example.com/wikipedia",
  });

  let row = await UrlbarTestUtils.waitForAutocompleteResultAt(window, 1);
  Assert.ok(!row.hasAttribute("sponsored"));

  await UrlbarTestUtils.promisePopupClose(window);
});

// Tests sponsored priority feature.
add_task(async function sponsoredPriority() {
  const cleanUpNimbus = await UrlbarTestUtils.initNimbusFeature({
    quickSuggestSponsoredPriority: true,
  });

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "fra",
  });
  await QuickSuggestTestUtils.assertIsQuickSuggest({
    window,
    index: 1,
    isSponsored: true,
    isBestMatch: true,
    bestMatchType: UrlbarShared.BEST_MATCH_TYPE.SMALL,
    url: "https://example.com/amp",
  });

  let row = await UrlbarTestUtils.waitForAutocompleteResultAt(window, 1);
  Assert.ok(row.hasAttribute("sponsored"));

  // Group label.
  let before = window.getComputedStyle(row, "::before");
  Assert.equal(before.content, "none", "::before.content is none");
  Assert.ok(!row.hasAttribute("label"), "Row should not have a group label");

  await UrlbarTestUtils.promisePopupClose(window);
  await cleanUpNimbus();
});

// Tests sponsored priority feature does not affect to non-sponsored suggestion.
add_task(async function sponsoredPriorityButNotSponsoredSuggestion() {
  const cleanUpNimbus = await UrlbarTestUtils.initNimbusFeature({
    quickSuggestSponsoredPriority: true,
  });

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "wikipedia",
  });
  await QuickSuggestTestUtils.assertIsQuickSuggest({
    window,
    index: 1,
    isSponsored: false,
    url: "https://example.com/wikipedia",
  });

  let row = await UrlbarTestUtils.waitForAutocompleteResultAt(window, 1);
  let before = window.getComputedStyle(row, "::before");
  Assert.equal(
    before.content,
    '"Firefox Suggest"',
    "::before.content is enabled"
  );
  Assert.equal(
    row.getAttribute("label"),
    "Firefox Suggest",
    "Row has general group label for quick suggest"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await cleanUpNimbus();
});

// AMP should be a top pick when quickSuggestAmpTopPickCharThreshold is non-zero
// and the matched keyword/search string meets the threshold.
add_task(async function ampTopPickCharThreshold_meetsThreshold() {
  // Search with a non-full keyword just to make sure that doesn't prevent the
  // suggestion from being a top pick. "fra" is the query, "frab" is the full
  // keyword.
  let query = "fra";
  const cleanUpNimbus = await UrlbarTestUtils.initNimbusFeature({
    quickSuggestAmpTopPickCharThreshold: query.length,
  });

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: query,
  });
  await QuickSuggestTestUtils.assertIsQuickSuggest({
    window,
    index: 1,
    isSponsored: true,
    isBestMatch: true,
    bestMatchType: UrlbarShared.BEST_MATCH_TYPE.SMALL,
    url: "https://example.com/amp",
  });

  let row = await UrlbarTestUtils.waitForAutocompleteResultAt(window, 1);

  // Group label.
  let before = window.getComputedStyle(row, "::before");
  Assert.equal(before.content, "none", "::before.content is none");
  Assert.ok(!row.hasAttribute("label"), "Row should not have a group label");

  await UrlbarTestUtils.promisePopupClose(window);
  await cleanUpNimbus();
});

// AMP should not be a top pick when quickSuggestAmpTopPickCharThreshold is
// non-zero and a typed non-full keyword falls below the threshold.
add_task(async function ampTopPickCharThreshold_belowThreshold() {
  // Search with a full keyword just to make sure that doesn't cause the
  // suggestion to be a top pick.
  let queryAndFullKeyword = "frab";
  const cleanUpNimbus = await UrlbarTestUtils.initNimbusFeature({
    quickSuggestAmpTopPickCharThreshold: 100,
  });

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: queryAndFullKeyword,
  });
  await QuickSuggestTestUtils.assertIsQuickSuggest({
    window,
    index: 1,
    isSponsored: true,
    url: "https://example.com/amp",
  });

  let row = await UrlbarTestUtils.waitForAutocompleteResultAt(window, 1);
  Assert.ok(
    !row.querySelector(".urlbarView-title > strong"),
    "Since the full keyword was matched, the title shouldn't have any bold text"
  );

  // Group label.
  let before = window.getComputedStyle(row, "::before");
  Assert.equal(
    before.content,
    '"Firefox Suggest"',
    "::before.content is enabled"
  );
  Assert.equal(
    row.getAttribute("label"),
    "Firefox Suggest",
    "Row has 'Firefox Suggest' group label"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await cleanUpNimbus();
});

// Tests the "Manage" result menu for sponsored suggestion.
add_task(async function resultMenu_manage_sponsored() {
  await doManageTest({
    input: "fra",
    index: 1,
  });
});

// Tests the "Manage" result menu for non-sponsored suggestion.
add_task(async function resultMenu_manage_nonSponsored() {
  await doManageTest({
    input: "wikipedia",
    index: 1,
  });
});

// Tests the "Manage" result menu for Navigational suggestion.
add_task(async function resultMenu_manage_navigational() {
  // Enable Merino.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.quicksuggest.online.available", true],
      ["browser.urlbar.quicksuggest.online.enabled", true],
    ],
  });

  MerinoTestUtils.server.response.body.suggestions = [
    MERINO_NAVIGATIONAL_SUGGESTION,
  ];

  await doManageTest({
    input: "test",
    index: 1,
  });

  await SpecialPowers.popPrefEnv();
});

// Tests the "Manage" result menu for Dynamic Wikipedia suggestion.
add_task(async function resultMenu_manage_dynamicWikipedia() {
  // Enable Merino.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.quicksuggest.online.available", true],
      ["browser.urlbar.quicksuggest.online.enabled", true],
    ],
  });
  MerinoTestUtils.server.response.body.suggestions = [
    MERINO_DYNAMIC_WIKIPEDIA_SUGGESTION,
  ];

  await doManageTest({
    input: "test",
    index: 1,
  });

  await SpecialPowers.popPrefEnv();
});

// Tests the "Learn more" result menu.
add_task(async function resultMenu_learn_more_sponsored() {
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "fra",
  });

  info("Selecting Learn more item from the result menu");
  let tabOpenPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    Services.urlFormatter.formatURLPref("app.support.baseURL") +
      "awesome-bar-result-menu"
  );
  await UrlbarTestUtils.openResultMenuAndClickItem(window, "help", {
    resultIndex: 1,
  });
  info("Waiting for Learn more link to open in a new tab");
  await tabOpenPromise;
  gBrowser.removeCurrentTab();

  await UrlbarTestUtils.promisePopupClose(window);
});

// Tests `quicksuggest.ampTopPickScoreForLargeIcon` (Nimbus variable
// `quickSuggestAmpTopPickScoreForLargeIcon`).
add_task(async function ampTopPickScoreForLargeIcon() {
  const TEST_DATA = [
    {
      topPick: true,
      scoreForLargeIcon: "1.0",
      query: "0.3",
      expected: {
        bestMatchType: UrlbarShared.BEST_MATCH_TYPE.SMALL,
        url: "https://example.com/amp/0.3",
      },
    },

    {
      topPick: true,
      scoreForLargeIcon: "1.0",
      query: "1.0",
      expected: {
        bestMatchType: UrlbarShared.BEST_MATCH_TYPE.LARGE,
        url: "https://example.com/amp/1.0",
      },
    },

    {
      topPick: true,
      scoreForLargeIcon: "",
      query: "1.0",
      expected: {
        bestMatchType: UrlbarShared.BEST_MATCH_TYPE.SMALL,
        url: "https://example.com/amp/1.0",
      },
    },

    {
      topPick: false,
      scoreForLargeIcon: "1.0",
      query: "1.0",
      expected: {
        bestMatchType: UrlbarShared.BEST_MATCH_TYPE.NONE,
        url: "https://example.com/amp/1.0",
      },
    },

    {
      topPick: false,
      scoreForLargeIcon: "",
      query: "1.0",
      expected: {
        bestMatchType: UrlbarShared.BEST_MATCH_TYPE.NONE,
        url: "https://example.com/amp/1.0",
      },
    },
  ];

  for (let { topPick, scoreForLargeIcon, query, expected } of TEST_DATA) {
    const cleanUpNimbus = await UrlbarTestUtils.initNimbusFeature({
      quickSuggestAmpTopPickScoreForLargeIcon: scoreForLargeIcon,
    });
    await doTopPickTest({ topPick, query, expected });
    await cleanUpNimbus();
  }
});

async function doTopPickTest({ query, topPick, expected }) {
  if (topPick) {
    UrlbarPrefs.set("quicksuggest.ampTopPickCharThreshold", 1);
  }

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: query,
  });

  await QuickSuggestTestUtils.assertIsQuickSuggest({
    window,
    index: 1,
    isSponsored: true,
    isBestMatch: topPick,
    bestMatchType: expected.bestMatchType,
    url: expected.url,
  });

  let row = await UrlbarTestUtils.waitForAutocompleteResultAt(window, 1);
  let icon = row.querySelector(".urlbarView-favicon");

  let expectedSize;
  switch (expected.bestMatchType) {
    case UrlbarShared.BEST_MATCH_TYPE.NONE:
      expectedSize = AMP_ICON_SIZE_NON_TOP_PICK;
      break;
    case UrlbarShared.BEST_MATCH_TYPE.SMALL:
      expectedSize = AMP_ICON_SIZE_TOP_PICK_SMALL;
      break;
    case UrlbarShared.BEST_MATCH_TYPE.LARGE:
      expectedSize = AMP_ICON_SIZE_TOP_PICK_LARGE;
      break;
  }

  let { width, height } = window.getComputedStyle(icon);
  Assert.equal(
    width,
    `${expectedSize}px`,
    "style.width should have expected value"
  );
  Assert.equal(
    height,
    `${expectedSize}px`,
    "style.height should have expected value"
  );

  // Check the bounding rect too for good measure.
  let iconRect = icon.getBoundingClientRect();
  Assert.equal(
    iconRect.width,
    expectedSize,
    "Icon bounding width should have expected value"
  );
  Assert.equal(
    iconRect.height,
    expectedSize,
    "Icon bounding height should have expected value"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  UrlbarPrefs.clear("quicksuggest.ampTopPickCharThreshold");
}
