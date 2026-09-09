/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Escape walks the newtab address bar back out: it closes the view, reverts
// what was typed, then hands focus back to the page around it.

"use strict";

const TEST_VALUE = "https://example.com/";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.suggest.searches", false]],
  });
});

add_task(async function escapeWalksBackOut() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  // One task, so each Escape and the state it leaves behind stay in the process
  // holding the bar.
  await NewtabSearchbarTestUtils.spawn(
    tab.linkedBrowser,
    [TEST_VALUE],
    async value => {
      let utils = NewtabSearchbarContentTestUtils;
      await utils.promiseAutocompleteResultPopup({ window: content, value });

      let escape = () => EventUtils.synthesizeKey("KEY_Escape", {}, content);
      let waitFor = (predicate, msg) =>
        ContentTaskUtils.waitForCondition(
          () => predicate(utils.getState(content)),
          msg
        );

      escape();
      await waitFor(state => !state.viewOpen, "the view closes");
      let state = utils.getState(content);
      Assert.ok(!state.viewVisible, "the view stops being painted");
      Assert.equal(state.value, value, "the value is still there");
      Assert.ok(state.focused, "the bar keeps focus");

      escape();
      await waitFor(s => !s.value, "the value reverts");
      Assert.ok(utils.getState(content).focused, "the bar still keeps focus");

      escape();
      await waitFor(s => !s.focused, "focus goes back to the page");
    }
  );

  BrowserTestUtils.removeTab(tab);
});
