/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// The input mode the bar hands the widget, which is what picks the on-screen
// keyboard. mozAwesomebar is chrome-only, so a bar hosted in a content page
// has to ask for the search keyboard to get one at all.

"use strict";

add_task(async function inputmode() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  await NewtabSearchbarTestUtils.spawn(tab.linkedBrowser, [], async () => {
    NewtabSearchbarContentTestUtils.getUrlbar(content).focus();
  });

  let description = "the search bar asks for the search keyboard";
  // The input mode reaches the widget over IPC, so it may not have arrived yet.
  await TestUtils.waitForCondition(
    () => window.windowUtils.focusedInputMode == "search",
    description
  );
  Assert.equal(window.windowUtils.focusedInputMode, "search", description);

  BrowserTestUtils.removeTab(tab);
});
