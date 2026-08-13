/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PASTE_TEXT = "context-menu paste text";
const PASTE_URL = "https://example.com/";

/**
 * Returns the Smartbar, its multiline editor and the moz-input-box menupopup
 * for a freshly opened AI Window.
 *
 * @param {Window} win
 */
async function setupSmartbar(win) {
  const browser = win.gBrowser.selectedBrowser;
  const aiWindow = await TestUtils.waitForCondition(
    () => browser.contentDocument?.querySelector("ai-window"),
    "Wait for ai-window element"
  );
  const smartbar = await TestUtils.waitForCondition(
    () => aiWindow.shadowRoot?.querySelector("#ai-window-smartbar"),
    "Wait for Smartbar to be rendered"
  );
  const editor = await TestUtils.waitForCondition(
    () => smartbar.querySelector("moz-multiline-editor"),
    "Wait for multiline editor"
  );

  smartbar.focus();
  await TestUtils.waitForCondition(
    () => smartbar.matches(":focus-within"),
    "Wait for Smartbar to be focused"
  );

  const inputBox = smartbar.querySelector("moz-input-box");
  return { editor, smartbar, inputBox, menupopup: inputBox.menupopup };
}

/**
 * Opens the moz-input-box context menu so its menu items get their enabled
 * state recomputed, then closes it again. The menu is opened directly rather
 * than via a synthesized right-click because the editor lives in a shadow DOM
 * and the synthesized contextmenu re-dispatch is unreliable in headless runs.
 *
 * @param {Element} menupopup
 */
async function openAndCloseContextMenu(menupopup) {
  const popupShown = BrowserTestUtils.waitForEvent(menupopup, "popupshown");
  menupopup.openPopupAtScreen(50, 50, true);
  await popupShown;

  const popupHidden = BrowserTestUtils.waitForEvent(menupopup, "popuphidden");
  menupopup.hidePopup();
  await popupHidden;
}

/**
 * Dispatches a context menu item's command, the same way activating the item
 * would. The command flows through the capturing "command" listener that the
 * Smartbar fix installs on the menupopup, so this exercises the routing
 * without depending on the popup staying open across the editor's async
 * focus/scroll (which can roll the popup up before activateItem runs).
 *
 * @param {Element} menupopup
 * @param {string} cmd
 */
function activateMenuCommand(menupopup, cmd) {
  const item = menupopup.querySelector(`[cmd="${cmd}"]`);
  Assert.ok(item, `${cmd} menu item exists`);
  item.doCommand();
}

/**
 * Returns the element the Smartbar attaches its contextmenu listener to (the
 * SmartbarInputController adapter's `input`, exposed as `inputField`).
 *
 * @param {Element} smartbar
 */
function getInputField(smartbar) {
  return smartbar.inputField;
}

/**
 * Regression test: keyboard-triggered contextmenu (button === 0, e.g. Shift+F10
 * or the Menu key) should anchor the popup to the input field instead of being
 * silently ignored.
 */
add_task(async function test_smartbar_context_menu_keyboard() {
  const win = await openAIWindow();
  const { smartbar, menupopup } = await setupSmartbar(win);
  const inputField = getInputField(smartbar);
  Assert.ok(inputField, "Smartbar inputField is available");

  const popupShown = BrowserTestUtils.waitForEvent(menupopup, "popupshown");
  inputField.dispatchEvent(
    new PointerEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 0,
    })
  );
  await popupShown;
  Assert.equal(
    menupopup.state,
    "open",
    "Keyboard contextmenu opens the moz-input-box popup"
  );

  const popupHidden = BrowserTestUtils.waitForEvent(menupopup, "popuphidden");
  menupopup.hidePopup();
  await popupHidden;

  await BrowserTestUtils.closeWindow(win);
});

/**
 * Regression test: mouse-triggered contextmenu (button === 2) should still open
 * the popup at the cursor screen coordinates.
 */
add_task(async function test_smartbar_context_menu_mouse() {
  const win = await openAIWindow();
  const { smartbar, menupopup } = await setupSmartbar(win);
  const inputField = getInputField(smartbar);

  const popupShown = BrowserTestUtils.waitForEvent(menupopup, "popupshown");
  inputField.dispatchEvent(
    new PointerEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      screenX: 50,
      screenY: 50,
    })
  );
  await popupShown;
  Assert.equal(
    menupopup.state,
    "open",
    "Mouse contextmenu opens the moz-input-box popup"
  );

  const popupHidden = BrowserTestUtils.waitForEvent(menupopup, "popuphidden");
  menupopup.hidePopup();
  await popupHidden;

  await BrowserTestUtils.closeWindow(win);
});

/**
 * Regression test: "Paste" in the Smartbar context menu should paste clipboard
 * contents into the multiline editor, matching Ctrl+V.
 */
add_task(async function test_smartbar_context_menu_paste() {
  const win = await openAIWindow();
  const { editor, menupopup } = await setupSmartbar(win);

  SpecialPowers.clipboardCopyString(PASTE_TEXT);

  await openAndCloseContextMenu(menupopup);
  const pasteItem = menupopup.querySelector('[cmd="cmd_paste"]');
  Assert.ok(pasteItem, "Paste menu item exists");
  Assert.ok(!pasteItem.disabled, "Paste menu item is enabled");

  activateMenuCommand(menupopup, "cmd_paste");

  await TestUtils.waitForCondition(
    () => editor.value == PASTE_TEXT,
    `Smartbar value should equal "${PASTE_TEXT}" after context-menu paste`
  );
  Assert.equal(
    editor.value,
    PASTE_TEXT,
    "Context-menu Paste should insert clipboard text into the Smartbar"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_smartbar_context_menu_paste_and_go_exists() {
  const win = await openAIWindow();
  const { inputBox, menupopup } = await setupSmartbar(win);

  await openAndCloseContextMenu(menupopup);
  const pasteAndGo = inputBox.getMenuItem("paste-and-go");
  Assert.ok(pasteAndGo, "Paste and Go menu item exists");

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_smartbar_context_menu_paste_and_go_disabled() {
  const win = await openAIWindow();
  const { inputBox, menupopup } = await setupSmartbar(win);

  Services.clipboard.emptyClipboard(Ci.nsIClipboard.kGlobalClipboard);

  await openAndCloseContextMenu(menupopup);
  const pasteAndGo = inputBox.getMenuItem("paste-and-go");
  Assert.ok(
    pasteAndGo.disabled,
    "Paste and Go is disabled with an empty clipboard"
  );

  SpecialPowers.clipboardCopyString(PASTE_URL);
  await openAndCloseContextMenu(menupopup);
  Assert.ok(
    !pasteAndGo.disabled,
    "Paste and Go is enabled once the clipboard has content"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_smartbar_context_menu_paste_and_go_submits() {
  const win = await openAIWindow();
  const { editor, inputBox, smartbar, menupopup } = await setupSmartbar(win);

  SpecialPowers.clipboardCopyString(PASTE_URL);

  await openAndCloseContextMenu(menupopup);
  const pasteAndGo = inputBox.getMenuItem("paste-and-go");

  const sb = sinon.createSandbox();
  const loadURL = sb.stub(smartbar, "_loadURL");
  pasteAndGo.doCommand();

  await BrowserTestUtils.waitForMutationCondition(
    editor,
    { childList: true, characterData: true, subtree: true },
    () => smartbar.value === ""
  );
  Assert.ok(loadURL.calledWith(PASTE_URL), "Paste and Go loads the pasted URL");

  sb.restore();
  await BrowserTestUtils.closeWindow(win);
});
