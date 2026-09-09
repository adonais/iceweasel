/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// The newtab results view scrolls within the space below the input, and its
// `<panel-list>` positions itself against a host that holds that scrollport.

"use strict";

// The rows come from form history because `UrlbarProviderPlaces` does not list
// `newtab_searchbar` among its supported SAPs, and because a form history result
// is `isBlockable`, which is what gives a row a result menu. The count only has
// to overflow the scrollport, which the space below the input bounds; the task
// asserts that it does, since the window has no fixed size.
const SUGGESTION_COUNT = 40;

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

add_task(async function staysOpenWhenTheViewIsScrolled() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;

  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser,
    value: "example",
  });

  await NewtabSearchbarTestUtils.spawn(browser, [], async () => {
    let utils = NewtabSearchbarContentTestUtils;
    utils.disableResultMenuAutohide(content);

    let scroller = utils
      .getResultsContainer(content)
      .closest(".urlbarView-body-outer");
    Assert.greater(
      scroller.scrollHeight,
      scroller.clientHeight,
      "The results overflow the scrollport"
    );

    // A frame reconstruction restores the scroll position, which is what the
    // spurious `scroll` event rides on, so the view has to be scrolled away
    // from the top.
    scroller.scrollTop = Math.floor(
      (scroller.scrollHeight - scroller.clientHeight) / 2
    );
    Assert.greater(scroller.scrollTop, 0, "The results list scrolled");

    // Opening the menu clicks the button, so the row it belongs to has to be
    // whole: the scroll leaves the rows at either edge of the scrollport
    // clipped.
    let scrollportRect = scroller.getBoundingClientRect();
    let resultIndex = -1;
    for (let i = 0; i < utils.getResultCount(content); i++) {
      let rect = utils.getRowAt(content, i).getBoundingClientRect();
      if (rect.top < scrollportRect.top) {
        continue;
      }
      if (rect.bottom > scrollportRect.bottom) {
        break;
      }
      if (utils.getButtonForResultIndex(content, "result-menu", i)) {
        resultIndex = i;
        break;
      }
    }
    Assert.greaterOrEqual(
      resultIndex,
      0,
      "Found a whole scrolled-into-view row with a menu"
    );

    await utils.openResultMenu(content, { resultIndex, byMouse: true });

    // A dismissal reaches the menu in the tick after it is shown, so give it
    // two frames to land.
    await new Promise(resolve =>
      content.requestAnimationFrame(() =>
        content.requestAnimationFrame(resolve)
      )
    );

    Assert.ok(
      utils.getUrlbar(content).view.resultMenu.matches(":popover-open"),
      "The result menu stayed open"
    );
  });

  BrowserTestUtils.removeTab(tab);
});
