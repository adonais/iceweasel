/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Losing focus closes the newtab address bar's view, and stops it painting.

"use strict";

const TEST_VALUE = "https://example.com/";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.suggest.searches", false]],
  });
});

add_task(async function blurClosesTheView() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;

  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser,
    value: TEST_VALUE,
  });
  Assert.ok(
    (await NewtabSearchbarTestUtils.getState(browser)).viewVisible,
    "the view is painted"
  );

  await NewtabSearchbarTestUtils.blur(browser);
  await NewtabSearchbarTestUtils.waitForViewClosed(browser);

  let state = await NewtabSearchbarTestUtils.getState(browser);
  Assert.ok(!state.viewVisible, "the view stops being painted");
  Assert.ok(!state.focused, "the bar lost focus");

  BrowserTestUtils.removeTab(tab);
});
