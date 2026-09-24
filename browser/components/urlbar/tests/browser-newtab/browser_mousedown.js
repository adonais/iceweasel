/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Pressing the mouse on the newtab address bar opens its view, empty or
// carrying a search the user left behind.

"use strict";

add_setup(async function () {
  await SearchTestUtils.installSearchExtension({}, { setAsDefault: true });
  await NewtabSearchbarTestUtils.formHistory.add(["a recent search"]);
});

add_task(async function mousedownOpensTheView() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;

  let opened = NewtabSearchbarTestUtils.waitForResults(browser);
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ".urlbar-input",
    { type: "mousedown" },
    browser
  );
  await opened;

  let state = await NewtabSearchbarTestUtils.getState(browser);
  Assert.ok(state.focused, "the bar took focus");
  Assert.ok(state.viewVisible, "the view is painted");
  Assert.greater(
    await NewtabSearchbarTestUtils.getResultCount(browser),
    0,
    "the zero-prefix view has rows"
  );

  await BrowserTestUtils.synthesizeMouseAtCenter(
    ".urlbar-input",
    { type: "mouseup" },
    browser
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function mousedownReopensAnAbandonedSearch() {
  for (let abandon of ["escape", "blur"]) {
    info(`Abandoning the search by ${abandon}`);
    let tab = await NewtabSearchbarTestUtils.openNewTabPage();
    let browser = tab.linkedBrowser;

    await doSearch(browser, "a recent");

    if (abandon == "escape") {
      await BrowserTestUtils.synthesizeKey("KEY_Escape", {}, browser);
    } else {
      await NewtabSearchbarTestUtils.blur(browser);
    }
    await NewtabSearchbarTestUtils.waitForViewClosed(browser);

    let opened = NewtabSearchbarTestUtils.waitForResults(browser);
    await BrowserTestUtils.synthesizeMouseAtCenter(
      ".urlbar-input",
      { type: "mousedown" },
      browser
    );
    await opened;

    let state = await NewtabSearchbarTestUtils.getState(browser);
    Assert.equal(state.value, "a recent", "the search string is still there");
    Assert.ok(state.viewVisible, "the view is painted again");
    Assert.greater(
      await NewtabSearchbarTestUtils.getResultCount(browser),
      0,
      "the view has rows"
    );

    await BrowserTestUtils.synthesizeMouseAtCenter(
      ".urlbar-input",
      { type: "mouseup" },
      browser
    );
    BrowserTestUtils.removeTab(tab);
  }
});
