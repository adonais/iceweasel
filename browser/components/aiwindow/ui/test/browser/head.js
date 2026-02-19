/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const AIWINDOW_URL = "chrome://browser/content/aiwindow/aiWindow.html";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.aiwindow.enabled", true]],
  });
});

/**
 * Opens a new AI Window
 *
 * @returns {Promise<Window>}
 */
async function openAIWindow() {
  const win = await BrowserTestUtils.openNewBrowserWindow({ aiWindow: true });
  await BrowserTestUtils.waitForMutationCondition(
    win.document.documentElement,
    { attributes: true },
    () => win.document.documentElement.hasAttribute("ai-window")
  );
  return win;
}
