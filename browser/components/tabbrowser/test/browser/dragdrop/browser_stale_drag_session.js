/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);

registerCleanupFunction(() => {
  dragService.getCurrentSession(window)?.endDragSession(false);
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

/**
 * Leaves the tab strip in the state an in-progress tab drag puts it in: a live
 * drag session and moving-tab mode, with no drop or dragend to follow.
 *
 * @returns {Promise<MozTabbrowserTab>} The tab being dragged.
 */
async function startTabDragWithoutEnding() {
  let tab = await addTab();
  EventUtils.startDragSession(window, "move");
  EventUtils.synthesizeDragOver(
    tab,
    gBrowser.tabs[0],
    null,
    "move",
    window,
    window,
    getDragEvent()
  );
  Assert.ok(
    gBrowser.tabContainer.hasAttribute("movingtab"),
    "Tab strip is in drag and drop mode"
  );
  Assert.ok(
    gNavToolbox.hasAttribute("movingtab"),
    "Toolbox is in drag and drop mode"
  );
  return tab;
}

/**
 * @param {string} msg  Describes what is expected to leave moving-tab mode.
 * @returns {Promise}
 */
function waitForMovingTabToEnd(msg) {
  return BrowserTestUtils.waitForMutationCondition(
    gBrowser.tabContainer,
    { attributes: true, attributeFilter: ["movingtab"] },
    () => !gBrowser.tabContainer.hasAttribute("movingtab"),
    { msg }
  );
}

function assertNotMovingTab(why) {
  Assert.ok(
    !gBrowser.tabContainer.hasAttribute("movingtab"),
    `Tab strip left drag and drop mode ${why}`
  );
  Assert.ok(
    !gNavToolbox.hasAttribute("movingtab"),
    `Toolbox left drag and drop mode ${why}`
  );
}

async function resetTelemetry() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();
}

function assertRecoveryRecorded(label) {
  for (let candidate of [
    "session_live",
    "session_live_after_drop",
    "session_ended",
    "session_ended_after_drop",
  ]) {
    let expected = candidate == label ? 1 : null;
    Assert.equal(
      Glean.tab.staleDragRecovery[candidate].testGetValue(),
      expected,
      `tab.staleDragRecovery["${candidate}"] is ${expected}`
    );
  }
}

add_task(async function test_session_disappears_without_dragend() {
  await resetTelemetry();
  let tab = await startTabDragWithoutEnding();
  let windowCount = [...Services.wm.getEnumerator("navigator:browser")].length;

  info("End the drag session the way a lost dragend would.");
  dragService.getCurrentSession(window).endDragSession(false);

  await waitForMovingTabToEnd(
    "Waiting for the stale drag session to be noticed"
  );
  assertNotMovingTab("after the drag session disappeared");
  Assert.equal(
    [...Services.wm.getEnumerator("navigator:browser")].length,
    windowCount,
    "Recovering didn't detach the tab into a new window"
  );
  assertRecoveryRecorded("session_ended");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_session_outlives_the_drag() {
  await resetTelemetry();
  let tab = await startTabDragWithoutEnding();
  let windowCount = [...Services.wm.getEnumerator("navigator:browser")].length;

  info("Press the primary button, which can't happen during a real drag.");
  EventUtils.synthesizeMouseAtCenter(
    gURLBar.inputField,
    { type: "mousedown" },
    window
  );

  assertNotMovingTab("after a mouse button press");
  Assert.ok(
    !dragService.getCurrentSession(window),
    "The stale drag session was ended"
  );
  Assert.equal(
    [...Services.wm.getEnumerator("navigator:browser")].length,
    windowCount,
    "Recovering didn't detach the tab into a new window"
  );
  assertRecoveryRecorded("session_live");

  // The press landed on the toolbox, because moving-tab mode makes #nav-bar
  // inert, while the release lands on the input. The click then goes to the two
  // targets' common ancestor, the toolbox, which is no control.
  AccessibilityUtils.setEnv({ mustHaveAccessibleRule: false });
  EventUtils.synthesizeMouseAtCenter(
    gURLBar.inputField,
    { type: "mouseup" },
    window
  );
  AccessibilityUtils.resetEnv();
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_drop_doesnt_taint_the_next_drag() {
  // The drop only sets its deadline when it animates, and it waits on a
  // transition the stylesheet only defines under prefers-reduced-motion:
  // no-preference. Overriding the media query keeps both in agreement.
  await SpecialPowers.pushPrefEnv({ set: [["ui.prefersReducedMotion", 0]] });
  await TestUtils.waitForCondition(
    () => !gReduceMotion,
    "Waiting for the reduced motion setting to be picked up"
  );

  let droppedTab = await addTab();

  EventUtils.startDragSession(window, "move");
  let [result, dataTransfer] = EventUtils.synthesizeDragOver(
    droppedTab,
    gBrowser.tabs[0],
    null,
    "move",
    window,
    window,
    getDragEvent()
  );
  EventUtils.synthesizeDropAfterDragOver(
    result,
    dataTransfer,
    gBrowser.tabs[0]
  );
  EventUtils._getDOMWindowUtils(window).dragSession?.endDragSession(true);
  await waitForMovingTabToEnd("Waiting for the drop to leave moving-tab mode");

  // Only the next drag's label matters here, so the drop's own outcome is
  // deliberately not asserted.
  await resetTelemetry();

  let tab = await startTabDragWithoutEnding();
  dragService.getCurrentSession(window).endDragSession(false);

  await waitForMovingTabToEnd(
    "Waiting for the stale drag session to be noticed"
  );
  assertRecoveryRecorded("session_ended");

  BrowserTestUtils.removeTab(droppedTab);
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
