/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test that AI chat sidebar is hidden in AI Window.
 */
add_task(async function test_aichat_sidebar_hidden_in_aiwindow() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.revamp", true],
      ["browser.ml.chat.enabled", true],
      ["browser.aiwindow.enabled", true],
    ],
  });

  const aiWin = await BrowserTestUtils.openNewBrowserWindow({ aiWindow: true });
  await aiWin.SidebarController.promiseInitialized;

  const result = await aiWin.SidebarController.show("viewGenaiChatSidebar");
  Assert.equal(result, false, "AI chat sidebar should not open in AI Window");

  await BrowserTestUtils.closeWindow(aiWin);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_aichat_sidebar_not_restored_in_aiwindow() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.revamp", true],
      ["browser.ml.chat.enabled", true],
      ["browser.aiwindow.enabled", true],
    ],
  });

  const aiWin = await BrowserTestUtils.openNewBrowserWindow({ aiWindow: true });
  await aiWin.SidebarController.promiseInitialized;

  await aiWin.SidebarController.initializeUIState({
    command: "viewGenaiChatSidebar",
    panelOpen: true,
  });

  Assert.ok(
    !aiWin.SidebarController.isOpen ||
      aiWin.SidebarController.currentID !== "viewGenaiChatSidebar",
    "AI chat sidebar should not be restored in AI Window"
  );

  await BrowserTestUtils.closeWindow(aiWin);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_other_sidebars_work_in_aiwindow() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.revamp", true],
      ["browser.ml.chat.enabled", true],
      ["browser.aiwindow.enabled", true],
    ],
  });

  const aiWin = await BrowserTestUtils.openNewBrowserWindow({ aiWindow: true });
  await aiWin.SidebarController.promiseInitialized;

  const result = await aiWin.SidebarController.show("viewHistorySidebar");
  Assert.equal(result, true, "History sidebar should open in AI Window");
  Assert.equal(
    aiWin.SidebarController.currentID,
    "viewHistorySidebar",
    "History sidebar should be the current sidebar"
  );

  aiWin.SidebarController.hide();
  await BrowserTestUtils.closeWindow(aiWin);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_aichat_hidden_in_vertical_tabs_aiwindow() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.revamp", true],
      ["browser.ml.chat.enabled", true],
      ["browser.aiwindow.enabled", true],
      ["sidebar.verticalTabs", true],
    ],
  });

  const aiWin = await BrowserTestUtils.openNewBrowserWindow({ aiWindow: true });
  await aiWin.SidebarController.promiseInitialized;

  const tools = aiWin.SidebarController.getTools();
  const aiChatTool = tools.find(t => t.commandID === "viewGenaiChatSidebar");

  Assert.ok(
    !aiChatTool,
    "AI chat tool should not exist in tools list in AI Window"
  );

  await BrowserTestUtils.closeWindow(aiWin);
  await SpecialPowers.popPrefEnv();
});
