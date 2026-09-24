/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// The in-page counterpart of browser-editing/browser_urlbar_selection.js. A
// drag that starts on a closed and unfocused bar has to survive everything the
// first mousedown sets off -- focus, the view opening, and the top layer moving
// with them; the toolbar bar loses the selection it is in the middle of to that
// (bug 2063341).

"use strict";

// Longer than the input, so both offsets the drag uses land inside the text.
const TEST_VALUE = "a search string ".repeat(20);

add_setup(async function () {
  // A local engine, so the mousedown doesn't reach for suggestions over the
  // network.
  await SearchTestUtils.installSearchExtension({}, { setAsDefault: true });
});

add_task(async function dragFromClosedAndUnfocused() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  await NewtabSearchbarTestUtils.spawn(
    tab.linkedBrowser,
    [TEST_VALUE],
    async value => {
      let utils = NewtabSearchbarContentTestUtils;
      let bar = utils.getUrlbar(content);
      // The setter leaves the caret and the scroll at the start.
      bar.value = value;

      let state = utils.getState(content);
      Assert.ok(!state.focused, "the bar starts unfocused");
      Assert.ok(!state.viewOpen, "and closed");

      for (let [type, x] of [
        ["mousemove", 30],
        ["mousedown", 30],
        ["mousemove", 60],
        ["mouseup", 60],
      ]) {
        EventUtils.synthesizeMouse(bar.inputField, x, 10, { type }, content);
      }

      Assert.ok(utils.getState(content).focused, "the drag focused the bar");
      Assert.notEqual(
        bar.selectionStart,
        bar.selectionEnd,
        "the drag selected part of the value"
      );
      Assert.notEqual(bar.selectionStart, 0, "not from its start");
      Assert.notEqual(bar.selectionEnd, value.length, "nor to its end");
    }
  );

  BrowserTestUtils.removeTab(tab);
});
