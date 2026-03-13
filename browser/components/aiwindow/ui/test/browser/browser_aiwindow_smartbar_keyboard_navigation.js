/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const isWindows = AppConstants.platform == "win";

async function getSelectionStart(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = await ContentTaskUtils.waitForCondition(
      () => aiWindowElement.shadowRoot?.querySelector("#ai-window-smartbar"),
      "Wait for Smartbar to be rendered"
    );
    return smartbar.inputField.selectionStart;
  });
}

add_task(async function test_smartbar_keyboard_horizontal_arrows() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  await typeInSmartbar(browser, "abc");

  await SpecialPowers.spawn(browser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = await ContentTaskUtils.waitForCondition(
      () => aiWindowElement.shadowRoot?.querySelector("#ai-window-smartbar"),
      "Wait for Smartbar to be rendered"
    );
    smartbar.inputField.setSelectionRange(0, 0);
  });

  await BrowserTestUtils.synthesizeKey("KEY_ArrowRight", {}, browser);
  is(
    await getSelectionStart(browser),
    1,
    "ArrowRight moves cursor forward by one"
  );

  await BrowserTestUtils.synthesizeKey("KEY_ArrowLeft", {}, browser);
  is(await getSelectionStart(browser), 0, "ArrowLeft moves cursor back by one");

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_smartbar_keyboard_vertical_arrows() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  await SpecialPowers.spawn(browser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = await ContentTaskUtils.waitForCondition(
      () => aiWindowElement.shadowRoot?.querySelector("#ai-window-smartbar"),
      "Wait for Smartbar to be rendered"
    );

    // not using typeInSmartbar because we need the line break
    smartbar.inputField.value = "Line 1\nLine 2";
    await new Promise(r => content.requestAnimationFrame(r));
    smartbar.inputField.setSelectionRange(3, 3);
  });

  // TODO(bug 2022453): On Windows, ArrowDown/Up open suggestions instead of
  // moving the cursor between lines but probably should be cross platform.
  await BrowserTestUtils.synthesizeKey("KEY_ArrowDown", {}, browser);
  Assert.greaterOrEqual(
    await getSelectionStart(browser),
    isWindows ? 3 : 7,
    "ArrowDown moves to second line"
  );

  await BrowserTestUtils.synthesizeKey("KEY_ArrowUp", {}, browser);
  Assert.less(
    await getSelectionStart(browser),
    7,
    "ArrowUp moves to first line"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_smartbar_sidebar_keyboard_horizontal_arrows() {
  const { win, sidebarBrowser } = await openAIWindowWithSidebar();

  await typeInSmartbar(sidebarBrowser, "abc");
  await SpecialPowers.spawn(sidebarBrowser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = await ContentTaskUtils.waitForCondition(
      () => aiWindowElement?.shadowRoot?.querySelector("#ai-window-smartbar"),
      "Sidebar smartbar should be loaded"
    );
    smartbar.inputField.setSelectionRange(0, 0);
  });

  await BrowserTestUtils.synthesizeKey("KEY_ArrowRight", {}, sidebarBrowser);
  is(
    await getSelectionStart(sidebarBrowser),
    1,
    "ArrowRight moves cursor forward by one"
  );

  await BrowserTestUtils.synthesizeKey("KEY_ArrowLeft", {}, sidebarBrowser);
  is(
    await getSelectionStart(sidebarBrowser),
    0,
    "ArrowLeft moves cursor back by one"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_smartbar_sidebar_keyboard_vertical_arrows() {
  const { win, sidebarBrowser } = await openAIWindowWithSidebar();

  await SpecialPowers.spawn(sidebarBrowser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = await ContentTaskUtils.waitForCondition(
      () => aiWindowElement?.shadowRoot?.querySelector("#ai-window-smartbar"),
      "Sidebar smartbar should be loaded"
    );

    // not using typeInSmartbar because we need the line break
    smartbar.inputField.value = "Line 1\nLine 2";
    await new Promise(r => content.requestAnimationFrame(r));
    smartbar.inputField.setSelectionRange(3, 3);
  });

  // TODO(bug 2022453): On Windows, ArrowDown/Up open suggestions instead of
  // moving the cursor between lines but probably should be cross platform.
  await BrowserTestUtils.synthesizeKey("KEY_ArrowDown", {}, sidebarBrowser);
  Assert.greaterOrEqual(
    await getSelectionStart(sidebarBrowser),
    isWindows ? 3 : 7,
    "ArrowDown moves to second line"
  );

  await BrowserTestUtils.synthesizeKey("KEY_ArrowUp", {}, sidebarBrowser);
  Assert.less(
    await getSelectionStart(sidebarBrowser),
    7,
    "ArrowUp moves to first line"
  );

  await BrowserTestUtils.closeWindow(win);
});
