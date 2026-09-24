/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Dismissing trending suggestions from the newtab search bar replaces the first
// trending row with an acknowledgment tip.

"use strict";

const CONFIG = [
  {
    identifier: "trending",
    base: {
      urls: {
        trending: {
          base: "https://example.com/browser/browser/components/search/test/browser/trendingSuggestionEngine.sjs",
          method: "GET",
        },
      },
    },
  },
];

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.suggest.topsites", false],
      ["browser.urlbar.suggest.recentsearches", false],
      // Already the default; pushed so the dismissal's flip is reverted.
      ["browser.urlbar.suggest.trending", true],
    ],
  });
  await SearchTestUtils.updateRemoteSettingsConfig(CONFIG);
});

add_task(async function dismissTrending() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;

  // An empty bar lists the trending suggestions.
  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser,
    value: "",
  });

  let count = await NewtabSearchbarTestUtils.getResultCount(browser);
  Assert.greater(count, 1, "The bar shows more than one trending suggestion");
  for (let i = 0; i < count; i++) {
    let { result } = await NewtabSearchbarTestUtils.getDetailsOfResultAt(
      browser,
      i
    );
    Assert.ok(result.payload.trending, `Row ${i} is a trending suggestion`);
  }

  await NewtabSearchbarTestUtils.spawn(browser, [], async () => {
    let utils = NewtabSearchbarContentTestUtils;
    utils.disableResultMenuAutohide(content);
    await utils.openResultMenuAndClickItem(content, "trendingblock", {
      resultIndex: 0,
      openByMouse: true,
    });
    // The engagement runs parent-side, so the rows update asynchronously.
    await ContentTaskUtils.waitForCondition(
      () => utils.getResultCount(content) == 1,
      "waiting for the trending rows to go"
    );
  });

  Assert.ok(
    !Services.prefs.getBoolPref("browser.urlbar.suggest.trending"),
    "Trending suggestions are turned off"
  );

  let details = await NewtabSearchbarTestUtils.getDetailsOfResultAt(browser, 0);
  Assert.equal(
    details.type,
    UrlbarShared.RESULT_TYPE.TIP,
    "The remaining row is a tip"
  );
  Assert.equal(
    details.result.payload.type,
    "dismissalAcknowledgment",
    "The tip acknowledges the dismissal"
  );
  await NewtabSearchbarTestUtils.spawn(browser, [], async () => {
    let utils = NewtabSearchbarContentTestUtils;
    let gotIt = utils.getButtonForResultIndex(content, "0", 0);
    Assert.ok(gotIt, "The tip has a 'Got it' button");
    utils.EventUtils.synthesizeMouseAtCenter(gotIt, {}, content);
    await ContentTaskUtils.waitForCondition(
      () => !utils.getResultCount(content),
      "waiting for the tip to go"
    );
  });

  BrowserTestUtils.removeTab(tab);
});
