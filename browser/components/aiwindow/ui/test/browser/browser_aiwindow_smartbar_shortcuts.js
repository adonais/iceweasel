/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that the smart cursor is not shown for selected text in the smartbar.
 */

"use strict";

const { GenAI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/genai/GenAI.sys.mjs"
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.chat.shortcuts.smartwindow", true],
      ["browser.ml.chat.shortcuts.debounce", 0],
    ],
  });
});

add_task(async function test_smartbar_selection_does_not_show_smart_cursor() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  await promiseSmartbarSuggestionsOpen(browser, () =>
    typeInSmartbar(browser, "tell me a random fact")
  );
  const spy = sinon.spy(GenAI, "handleShortcutsMessage");

  await SpecialPowers.spawn(browser, [], async () => {
    const smartbar = content.document
      .querySelector("ai-window")
      .shadowRoot.querySelector("#ai-window-smartbar");
    const input =
      smartbar.inputField.shadowRoot.querySelector("[contenteditable]");
    const y = input.getBoundingClientRect().height / 2;
    EventUtils.synthesizeMouse(input, 5, y, { type: "mousedown" }, content);
    EventUtils.synthesizeMouse(input, 200, y, { type: "mousemove" }, content);
    EventUtils.synthesizeMouse(input, 200, y, { type: "mouseup" }, content);
  });
  await TestUtils.waitForCondition(() => spy.callCount, "shortcut");
  Assert.equal(
    win.document.getElementById("selection-shortcut-action-panel").state,
    "closed",
    "Smart cursor does not show for selection"
  );

  spy.restore();
  await BrowserTestUtils.closeWindow(win);
});
