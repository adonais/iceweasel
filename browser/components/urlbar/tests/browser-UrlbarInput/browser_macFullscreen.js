/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(function () {
  UrlbarTestUtils.registerZeroPrefixProvider();
});

add_task(async function test_tall_popup_stays_in_window() {
  let provider = new UrlbarTestUtils.TestProvider({
    priority: Infinity,
    results: Array.from(
      { length: 10 },
      (_, index) =>
        new UrlbarResult({
          type: UrlbarShared.RESULT_TYPE.URL,
          source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
          payload: { url: `https://example.com/${index}` },
        })
    ),
  });
  let manager = ProvidersManager.getInstanceForSap("urlbar");
  let win = await BrowserTestUtils.openNewBrowserWindow();
  manager.registerProvider(provider);
  try {
    win.resizeTo(1000, 400);
    for (let followsTransforms of [false, true]) {
      await SpecialPowers.pushPrefEnv({
        set: [
          [
            "layout.css.anchor-positioning.follows-transforms.enabled",
            followsTransforms,
          ],
        ],
      });
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window: win,
        value: "overflow",
      });

      for (let shift of [40, 0]) {
        win.FullScreen.shiftMacToolbarDown(shift);
        await win.promiseDocumentFlushed(() => {});

        let panel = win.gURLBar.panel;
        let results = panel.querySelector(".urlbarView-results");
        Assert.greater(
          results.scrollHeight,
          results.clientHeight,
          "The tall suggestions list scrolls"
        );
        Assert.lessOrEqual(
          panel.getBoundingClientRect().bottom,
          win.innerHeight,
          "The suggestions stay within the window after the toolbar shift"
        );
      }

      await UrlbarTestUtils.promisePopupClose(win);
      await SpecialPowers.popPrefEnv();
    }
  } finally {
    manager.unregisterProvider(provider);
    win.FullScreen.shiftMacToolbarDown(0);
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_popup_follows_toolbar() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  try {
    for (let followsTransforms of [false, true]) {
      info(`Testing followsTransforms=${followsTransforms}`);
      await SpecialPowers.pushPrefEnv({
        set: [
          [
            "layout.css.anchor-positioning.follows-transforms.enabled",
            followsTransforms,
          ],
        ],
      });
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window: win,
        value: "",
      });

      let input = win.gURLBar.querySelector(".urlbar-input-container");
      let inputTop = input.getBoundingClientRect().top;
      let popupTop = win.gURLBar.panel.getBoundingClientRect().top;

      for (let shift of [16, 40, 0]) {
        win.FullScreen.shiftMacToolbarDown(shift);
        await win.promiseDocumentFlushed(() => {});

        let inputRect = input.getBoundingClientRect();
        let popupRect = win.gURLBar.panel.getBoundingClientRect();
        Assert.lessOrEqual(
          Math.abs(inputRect.top - inputTop - shift),
          1,
          `The input follows the toolbar's ${shift}px shift`
        );
        Assert.lessOrEqual(
          Math.abs(popupRect.top - popupTop - shift),
          1,
          `The suggestions follow the toolbar's ${shift}px shift`
        );
      }

      await UrlbarTestUtils.promisePopupClose(win);
      await SpecialPowers.popPrefEnv();
    }
  } finally {
    win.FullScreen.shiftMacToolbarDown(0);
    await BrowserTestUtils.closeWindow(win);
  }
});
