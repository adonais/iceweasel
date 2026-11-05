/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_SELECT_AND_MARK_MENU_ITEM() {
  const action = {
    type: "SELECT_AND_MARK_MENU_ITEM",
    data: { itemIds: ["appMenu-history-button", "appMenu-restoreSession"] },
  };

  await SMATestUtils.executeAndValidateAction(action);

  Assert.equal(PanelUI.panel.state, "open", "App menu was opened");

  // The main view's contents only exist once the panel has been built.
  const historyButton = document.getElementById("appMenu-history-button");
  Assert.ok(historyButton, "App menu history button exists");

  await TestUtils.waitForCondition(
    () => PanelView.forNode(PanelUI.mainView).selectedElement === historyButton,
    "History button becomes the selected element of the main view"
  );
  Assert.equal(
    historyButton.getAttribute("tabindex"),
    "-1",
    "History button was marked"
  );

  let popupHidden = BrowserTestUtils.waitForEvent(PanelUI.panel, "popuphidden");
  PanelUI.hide();
  await popupHidden;
});
