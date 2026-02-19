/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const FIRSTRUN_URL = "chrome://browser/content/aiwindow/firstrun.html";

async function openFirstrunPage() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    FIRSTRUN_URL
  );
  return tab;
}

add_task(async function test_firstrun_welcome_screen_renders() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.aiwindow.firstrun.autoAdvanceMS", 0]],
  });

  const tab = await openFirstrunPage();

  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".screen.AI_WINDOW_INTRO"),
      "Wait for the AI Window intro screen to be rendered"
    );

    const introScreen = content.document.querySelector(
      ".screen.AI_WINDOW_INTRO"
    );
    Assert.ok(
      introScreen,
      "The intro screen with class 'screen AI_WINDOW_INTRO' should be present"
    );

    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".screen.AI_WINDOW_CHOOSE_MODEL"),
      "Wait for the AI Window choose model screen to be rendered"
    );
  });

  BrowserTestUtils.removeTab(tab);
});
