/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Opening the newtab address bar's view leaves the page's own scrollable area
// alone, and a long page doesn't give the view a long panel.

"use strict";

// As in browser_resultMenu.js, the rows come from form history. The window is
// short enough that this many of them cannot fit below the input.
const SUGGESTION_COUNT = 40;
const WINDOW_WIDTH = 600;
const WINDOW_HEIGHT = 450;

const CONFIG = [{ identifier: "engine1" }];

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.maxHistoricalSearchSuggestions", SUGGESTION_COUNT],
      ["browser.urlbar.maxRichResults", SUGGESTION_COUNT + 1],
    ],
  });
  await SearchTestUtils.updateRemoteSettingsConfig(CONFIG);

  await NewtabSearchbarTestUtils.formHistory.add(
    Array.from({ length: SUGGESTION_COUNT }, (_, i) => `example ${i}`)
  );
});

/**
 * Opens a short window on about:newtab and runs a query in its address bar.
 *
 * @param {object} scope
 *   The test scope, which the utils take to reach `SimpleTest`.
 * @param {number} spacerHeight
 *   Height of a block appended to the page before the query, to stand in for a
 *   page whose own content scrolls.
 * @returns {Promise<object>}
 *   The window, its tab, and the page's scroll height before the query.
 */
async function openShortWindow(scope, spacerHeight = 0) {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  let resized = BrowserTestUtils.waitForEvent(
    win,
    "resize",
    false,
    () => win.innerHeight <= WINDOW_HEIGHT
  );
  win.resizeTo(WINDOW_WIDTH, WINDOW_HEIGHT);
  await resized;

  NewtabSearchbarTestUtils.init(scope, win);
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;

  let scrollHeightBefore = await NewtabSearchbarTestUtils.spawn(
    browser,
    [spacerHeight],
    px => {
      if (px) {
        let spacer = content.document.createElement("div");
        spacer.style.height = `${px}px`;
        content.document.body.appendChild(spacer);
      }
      return content.document.documentElement.scrollHeight;
    }
  );

  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser,
    value: "example",
  });

  return { win, browser, scrollHeightBefore };
}

add_task(async function leavesTheScrollableAreaAlone() {
  let { win, browser, scrollHeightBefore } = await openShortWindow(this);

  await NewtabSearchbarTestUtils.spawn(
    browser,
    [scrollHeightBefore],
    async heightBefore => {
      let bar = NewtabSearchbarContentTestUtils.getUrlbar(content);
      let scroller =
        NewtabSearchbarContentTestUtils.getResultsContainer(content);
      Assert.greater(
        scroller.scrollHeight,
        scroller.clientHeight,
        "The results overflow the scrollport"
      );

      // The background reaches past the element's border box, so it is the
      // bottom edge that has to fit.
      let background = bar
        .querySelector(".urlbar-background")
        .getBoundingClientRect();
      Assert.lessOrEqual(
        background.bottom + content.scrollY,
        heightBefore,
        "The open bar fits inside the page"
      );

      Assert.equal(
        content.document.documentElement.scrollHeight,
        heightBefore,
        "The page's scrollable area is unchanged"
      );
    }
  );

  await BrowserTestUtils.closeWindow(win);
  NewtabSearchbarTestUtils.init(this, window);
});

add_task(async function boundedByAScreenful() {
  let { win, browser, scrollHeightBefore } = await openShortWindow(this, 1500);

  await NewtabSearchbarTestUtils.spawn(
    browser,
    [scrollHeightBefore],
    async heightBefore => {
      Assert.greater(
        heightBefore,
        content.innerHeight,
        "sanity check: the page scrolls on its own"
      );

      let bar = NewtabSearchbarContentTestUtils.getUrlbar(content);
      Assert.lessOrEqual(
        bar.getBoundingClientRect().height,
        content.innerHeight,
        "The open bar is no taller than the viewport"
      );

      Assert.equal(
        content.document.documentElement.scrollHeight,
        heightBefore,
        "The page's scrollable area is unchanged"
      );
    }
  );

  await BrowserTestUtils.closeWindow(win);
  NewtabSearchbarTestUtils.init(this, window);
});
