/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async () => {
  await BrowserTestUtils.overflowTabs(registerCleanupFunction, window, {
    overflowAtStart: false,
    overflowTabFactor: 3,
  });
  await BrowserTestUtils.allTabOpenAnimationsFinished(window);
});

registerCleanupFunction(() => {
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

add_task(async function test_dragstart_on_scroll_button_does_not_grab_tab() {
  // Dragging a scroll button should not grab the tab that happens to be under
  // the cursor.
  const arrowScrollbox = gBrowser.tabContainer.arrowScrollbox;
  Assert.ok(arrowScrollbox.overflowing, "Tab strip is overflowing");

  const button = arrowScrollbox._scrollButtonDown;
  await BrowserTestUtils.waitForMutationCondition(
    button,
    { attributes: true },
    () => !button.disabled,
    { msg: "There is an enabled scroll button" }
  );

  const tabOrder = [...gBrowser.tabs];

  info("Attempt to hold, then drag, the enabled scroll button.");
  await EventUtils.synthesizePlainDragAndDrop({
    srcElement: button,
    stepX: 9,
    stepY: 0,
    expectCancelDragStart: true,
  });
  arrowScrollbox._stopScroll();

  Assert.deepEqual(
    gBrowser.tabs,
    tabOrder,
    "Tab order is unchanged after dragging a scroll button"
  );
});
