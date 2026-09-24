/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// The in-page counterpart of browser-editing/browser_undo_history.js. A bar in
// the toolbar stays a popover for as long as it can break out, while the one on
// about:newtab takes the top layer while the user is interacting with it
// (browser_topLayer.js). Each transition reconstructs the input's frame, and
// Gecko drops an editor's undo history when that happens (bug 2017065), so the
// transitions have to fall outside the interaction.

"use strict";

const TEST_VALUE = "example.com";

add_setup(async function () {
  // A local engine, so typing doesn't reach for suggestions over the network.
  await SearchTestUtils.installSearchExtension({}, { setAsDefault: true });
});

add_task(async function undoAfterViewClose() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  await NewtabSearchbarTestUtils.spawn(
    tab.linkedBrowser,
    [TEST_VALUE],
    async value => {
      let utils = NewtabSearchbarContentTestUtils;
      let bar = utils.getUrlbar(content);

      // Typed key by key: the value setter records no undo transaction.
      bar.focus();
      EventUtils.sendString(value, content);
      await ContentTaskUtils.waitForCondition(
        () => utils.getState(content).viewOpen,
        "the view opens"
      );
      Assert.equal(
        utils.getState(content).value,
        value,
        "the string was typed"
      );

      EventUtils.synthesizeKey("KEY_Escape", {}, content);
      await ContentTaskUtils.waitForCondition(
        () => !utils.getState(content).viewOpen,
        "the view closes"
      );
      Assert.equal(
        utils.getState(content).value,
        value,
        "the value survives the view closing"
      );

      EventUtils.synthesizeKey("z", { accelKey: true }, content);
      Assert.equal(bar.inputField.value, "", "undo removed the typed string");
    }
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function undoFromContextMenu() {
  // A recent search, so the view opens on the mousedown and is still open when
  // the context menu comes up.
  await NewtabSearchbarTestUtils.formHistory.add(["a recent search"]);

  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;

  let opened = NewtabSearchbarTestUtils.waitForResults(browser);
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ".urlbar-input",
    { type: "mousedown" },
    browser
  );
  await opened;
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ".urlbar-input",
    { type: "mouseup" },
    browser
  );

  await NewtabSearchbarTestUtils.spawn(browser, [TEST_VALUE], async value => {
    let utils = NewtabSearchbarContentTestUtils;
    EventUtils.sendString(value, content);
    await ContentTaskUtils.waitForCondition(
      () => utils.getState(content).value == value,
      "the string was typed"
    );
  });

  let menu = document.getElementById("contentAreaContextMenu");
  let shown = BrowserTestUtils.waitForEvent(menu, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ".urlbar-input",
    { type: "contextmenu", button: 2 },
    browser
  );
  await shown;

  Assert.ok(
    (await NewtabSearchbarTestUtils.getState(browser)).viewOpen,
    "the context menu leaves the view open"
  );

  let hidden = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  menu.activateItem(document.getElementById("context-undo"));
  await hidden;

  await NewtabSearchbarTestUtils.spawn(browser, [TEST_VALUE], async value => {
    let utils = NewtabSearchbarContentTestUtils;
    // The command runs in the parent, so its effect arrives asynchronously.
    await ContentTaskUtils.waitForCondition(
      () => utils.getState(content).value != value,
      "the undo command reaches the input"
    );
    Assert.equal(
      utils.getState(content).value,
      "",
      "undo removed the typed string"
    );
  });

  BrowserTestUtils.removeTab(tab);
});

// Setting the bar's value drops the input's undo history unless the input
// carries preserveundohistory, which about:newtab honors like a chrome
// document (bug 2069367).
add_task(async function undoAfterValueSetter() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  await NewtabSearchbarTestUtils.spawn(
    tab.linkedBrowser,
    [TEST_VALUE],
    async value => {
      let utils = NewtabSearchbarContentTestUtils;
      let bar = utils.getUrlbar(content);

      bar.focus();
      EventUtils.sendString(value, content);
      await ContentTaskUtils.waitForCondition(
        () => utils.getState(content).value == value,
        "the string was typed"
      );

      bar.value = "something else";
      Assert.equal(
        bar.inputField.value,
        "something else",
        "the setter replaced the typed string"
      );

      EventUtils.synthesizeKey("z", { accelKey: true }, content);
      Assert.equal(
        bar.inputField.value,
        value,
        "undo restored the typed string"
      );
    }
  );

  BrowserTestUtils.removeTab(tab);
});
