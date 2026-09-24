/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Only the newtab address bar's view takes the top layer, and only while it is
// open. The input is ordinary page content throughout, so a modal dialog the
// page opens -- New Tab's settings pane -- paints over the bar without the bar
// having to give anything back.

"use strict";

const TEST_VALUE = "https://example.com/";

add_setup(useEngineWithoutSuggestions);

add_task(async function topLayerFollowsTheView() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;

  Assert.ok(
    !(await NewtabSearchbarTestUtils.getState(browser)).popoverOpen,
    "a closed view is ordinary page content"
  );

  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser,
    value: TEST_VALUE,
  });
  let state = await NewtabSearchbarTestUtils.getState(browser);
  Assert.ok(state.viewVisible, "the view is painted");
  Assert.ok(state.popoverOpen, "an open view is in the top layer");

  await NewtabSearchbarTestUtils.blur(browser);
  await NewtabSearchbarTestUtils.waitForViewClosed(browser);
  Assert.ok(
    !(await NewtabSearchbarTestUtils.getState(browser)).popoverOpen,
    "the view gives the top layer back"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function focusAloneStaysOutOfTheTopLayer() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  await NewtabSearchbarTestUtils.spawn(tab.linkedBrowser, [], async () => {
    let utils = NewtabSearchbarContentTestUtils;
    utils.getUrlbar(content).focus();
    await ContentTaskUtils.waitForCondition(
      () => utils.getState(content).focused,
      "the bar takes focus"
    );
    Assert.ok(
      !utils.getState(content).popoverOpen,
      "focus alone puts nothing in the top layer"
    );

    let dialog = content.document.body.appendChild(
      content.document.createElement("dialog")
    );
    dialog.showModal();
    Assert.ok(
      !utils.getState(content).popoverOpen,
      "the dialog paints over a bar that was never above it"
    );
    dialog.remove();
  });

  BrowserTestUtils.removeTab(tab);
});
