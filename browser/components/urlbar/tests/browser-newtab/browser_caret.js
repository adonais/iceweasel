/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Committing a load leaves the newtab address bar's caret where it was.
// Collapsing it to keep a domain visible belongs to the address bar, whose
// value the load has replaced by then.

"use strict";

// Slow enough that the load doesn't replace the page holding the bar before
// the caret has been read.
const SLOW_URL =
  "https://example.com/browser/browser/components/urlbar/tests/browser/slow-page.sjs";
const TEST_URL = "https://example.com/";

add_setup(useEngineWithoutSuggestions);

add_task(async function sameTab() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  await NewtabSearchbarTestUtils.spawn(
    tab.linkedBrowser,
    [SLOW_URL],
    async value => {
      let utils = NewtabSearchbarContentTestUtils;
      await utils.promiseAutocompleteResultPopup({ window: content, value });

      let bar = utils.getUrlbar(content);
      EventUtils.synthesizeKey("KEY_Enter", {}, content);
      // The Enter key up hands the load to the parent and waits for it to
      // focus the browser, so the caret can only settle once it's done.
      await ContentTaskUtils.waitForCondition(
        () => !bar._keyDownEnterDeferred,
        "the Enter key up finished"
      );

      Assert.equal(
        bar.selectionStart,
        value.length,
        "the caret stayed at the end of the value"
      );
      Assert.equal(bar.selectionEnd, value.length, "nothing got selected");
    }
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function modifierOpensNewTab() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  let opened = BrowserTestUtils.waitForNewTab(gBrowser, TEST_URL, true);
  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser: tab.linkedBrowser,
    value: TEST_URL,
  });
  await BrowserTestUtils.synthesizeKey(
    "KEY_Enter",
    { altKey: true },
    tab.linkedBrowser
  );
  let newTab = await opened;

  let caret = await NewtabSearchbarTestUtils.spawn(
    tab.linkedBrowser,
    [],
    () => {
      let bar = NewtabSearchbarContentTestUtils.getUrlbar(content);
      return { start: bar.selectionStart, end: bar.selectionEnd };
    }
  );
  Assert.equal(
    caret.start,
    TEST_URL.length,
    "the caret stayed at the end of the value"
  );
  Assert.equal(caret.end, TEST_URL.length, "nothing got selected");

  BrowserTestUtils.removeTab(newTab);
  BrowserTestUtils.removeTab(tab);
});
