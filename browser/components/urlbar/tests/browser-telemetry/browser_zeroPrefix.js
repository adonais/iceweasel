/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

/**
 * This file tests urlbar telemetry related to the zero-prefix view, i.e., when
 * the search string is empty.
 */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  CustomizableUITestUtils:
    "resource://testing-common/CustomizableUITestUtils.sys.mjs",
});

const METRICS = ["abandonment", "engagement", "exposure"];
const SAPS = ["urlbar", "searchbar", "newtab_searchbar", "smartbar"];

add_setup(async function () {
  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  await SearchTestUtils.installSearchExtension({}, { setAsDefault: true });
  await updateTopSitesAndAwaitChanged();
});

// zero prefix engagement
add_task(async function engagement() {
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    await showZeroPrefix();
    await checkCounters({ exposure: { urlbar: 1 } });

    info("Finding row with result type URL");
    let foundURLRow = false;
    let count = UrlbarTestUtils.getResultCount(window);
    for (let i = 0; i < count && !foundURLRow; i++) {
      EventUtils.synthesizeKey("KEY_ArrowDown");
      let index = UrlbarTestUtils.getSelectedRowIndex(window);
      Assert.equal(index, i, "The expected row index should be selected");
      let details = await UrlbarTestUtils.getDetailsOfResultAt(window, i);
      info(`Checked row at index ${i}, result type is: ${details.type}`);
      if (details.type == UrlbarShared.RESULT_TYPE.URL) {
        foundURLRow = true;
      }
    }
    Assert.ok(foundURLRow, "Should have found a row with result type URL");

    let loadPromise = BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);
    EventUtils.synthesizeKey("KEY_Enter");
    await loadPromise;
  });

  await checkCounters({ engagement: { urlbar: 1 } });
});

// The search bar shares this view and counts under its own label.
add_task(async function searchbarIsCounted() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.search.widget.new", true]],
  });
  let cuiTestUtils = new CustomizableUITestUtils(window);
  await cuiTestUtils.addSearchBar();
  let searchbar = SearchbarTestUtils.getUrlbar(window);
  // A recent search, so the zero-prefix query has something to show and the
  // view opens the way it does for a user who has searched before.
  await SearchbarTestUtils.formHistory.add(["a recent search"]);

  try {
    await BrowserTestUtils.withNewTab("about:blank", async () => {
      let { promise, cleanup } = waitForQueryFinished(searchbar);
      await SimpleTest.promiseFocus(window);
      await SearchbarTestUtils.promisePopupOpen(window, () => {
        EventUtils.synthesizeMouseAtCenter(searchbar.inputField, {}, window);
      });
      await promise;
      cleanup();

      Assert.greater(
        SearchbarTestUtils.getResultCount(window),
        0,
        "The search bar's zero prefix view has a row"
      );
      await checkCounters({ exposure: { searchbar: 1 } });

      await SearchbarTestUtils.promisePopupClose(window, () =>
        EventUtils.synthesizeKey("KEY_Escape")
      );
      await checkCounters({ abandonment: { searchbar: 1 } });
    });
  } finally {
    searchbar.view.queryContextCache.clear();
    await SearchbarTestUtils.formHistory.clear();
    await cuiTestUtils.removeSearchBar();
    await SpecialPowers.popPrefEnv();
  }
});

// zero prefix abandonment
add_task(async function abandonment() {
  // Open and close the view twice. The second time the view will used a cached
  // query context and that shouldn't interfere with telemetry.
  for (let i = 0; i < 2; i++) {
    await showZeroPrefix();
    await checkCounters({ exposure: { urlbar: 1 } });

    await UrlbarTestUtils.promisePopupClose(window, () => gURLBar.blur());
    await checkCounters({ abandonment: { urlbar: 1 } });
  }
});

// Shows the zero-prefix view, does some searches, then shows it again by doing
// a search for an empty string.
add_task(async function searches() {
  info("Show zero prefix");
  await showZeroPrefix();
  await checkCounters({ exposure: { urlbar: 1 } });

  info("Search for 't'");
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "t",
  });
  await checkCounters({});

  info("Search for 'te'");
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "te",
  });
  await checkCounters({});

  info("Search for 't'");
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "t",
  });
  await checkCounters({});

  info("Search for ''");
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "",
  });
  await checkCounters({ exposure: { urlbar: 1 } });

  info("Blur urlbar and close view");
  await UrlbarTestUtils.promisePopupClose(window, () => gURLBar.blur());
  await checkCounters({ abandonment: { urlbar: 1 } });
});

// A zero prefix engagement should not be recorded when the view isn't showing
// zero prefix.
add_task(async function notZeroPrefix_engagement() {
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "test",
    });
    let loadPromise = BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);
    EventUtils.synthesizeKey("KEY_Enter");
    await loadPromise;
  });

  await checkCounters({});
});

// A zero prefix abandonment should not be recorded when the view isn't showing
// zero prefix.
add_task(async function notZeroPrefix_abandonment() {
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "test",
  });
  await UrlbarTestUtils.promisePopupClose(window, () => gURLBar.blur());

  await checkCounters({});
});

/**
 * Asserts the counters recorded since the previous call and resets them.
 *
 * @param {object} expected
 *   Maps metric names to the values expected per label, e.g.
 *   `{ exposure: { urlbar: 1 } }`. Metrics and labels left out are expected
 *   not to have been recorded at all.
 */
async function checkCounters(expected) {
  await Services.fog.testFlushAllChildren();
  for (let metric of METRICS) {
    for (let sap of SAPS) {
      Assert.strictEqual(
        Glean.urlbarZeroprefix2[metric][sap].testGetValue(),
        expected[metric]?.[sap] ?? null,
        `urlbar.zeroprefix2.${metric}["${sap}"]`
      );
    }
  }
  Services.fog.testResetFOG();
}

async function showZeroPrefix() {
  let { promise, cleanup } = waitForQueryFinished();
  await SimpleTest.promiseFocus(window);
  await UrlbarTestUtils.promisePopupOpen(window, () =>
    document.getElementById("Browser:OpenLocation").doCommand()
  );
  await promise;
  cleanup();

  Assert.greater(
    UrlbarTestUtils.getResultCount(window),
    0,
    "There should be at least one row in the zero prefix view"
  );
}

/**
 * Returns a promise that's resolved on the next `onQueryFinished()`. It's
 * important to wait for `onQueryFinished()` because that's when the view checks
 * whether it's showing zero prefix.
 *
 * @param {UrlbarInput} [input]
 *   The input whose query to wait for.
 * @returns {object}
 *   An object with the following properties:
 *     {Promise} promise
 *       Resolved when `onQueryFinished()` is called.
 *     {Function} cleanup
 *       This should be called to remove the listener.
 */
function waitForQueryFinished(input = gURLBar) {
  let deferred = Promise.withResolvers();
  let listener = {
    onQueryFinished: () => deferred.resolve(),
  };
  input.controller.addListener(listener);

  return {
    promise: deferred.promise,
    cleanup() {
      input.controller.removeListener(listener);
    },
  };
}

async function updateTopSitesAndAwaitChanged() {
  let url = "http://mochi.test:8888/topsite";
  for (let i = 0; i < 5; i++) {
    await PlacesTestUtils.addVisits(url);
  }

  info("Updating top sites and awaiting newtab-top-sites-changed");
  let changedPromise = TestUtils.topicObserved("newtab-top-sites-changed").then(
    () => info("Observed newtab-top-sites-changed")
  );
  await updateTopSites(sites => sites?.length);
  await changedPromise;
}
