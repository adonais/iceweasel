/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

registerCleanupFunction(() => ContextualIdentityService.resetDefault());

async function openContainersPane() {
  await openPreferencesViaOpenPreferencesAPI("containers", { leaveOpen: true });
  let win = gBrowser.contentWindow;
  let control = await settingControlRenders("containers-list", win);
  let boxGroup = control.controlEl;
  await boxGroup.updateComplete;
  return { win, boxGroup, tab: gBrowser.selectedTab };
}

function getItem(boxGroup, userContextId) {
  return boxGroup.querySelector(`moz-box-item[value="${userContextId}"]`);
}

function getRenderedOrder(boxGroup) {
  return Array.from(boxGroup.querySelectorAll("moz-box-item")).map(item =>
    parseInt(item.getAttribute("value"), 10)
  );
}

async function assertOrder(boxGroup, expected, message) {
  Assert.deepEqual(
    ContextualIdentityService.getPublicUserContextIds(),
    expected,
    message
  );
  await BrowserTestUtils.waitForMutationCondition(
    boxGroup,
    { childList: true, subtree: true, attributes: true },
    () => getRenderedOrder(boxGroup).join() == expected.join()
  );
  Assert.deepEqual(
    getRenderedOrder(boxGroup),
    expected,
    `${message} (list re-renders in the new order)`
  );
}

add_task(async function test_reorder_with_drag_and_drop() {
  let { win, boxGroup, tab } = await openContainersPane();
  let [id0, id1, id2, id3] = getRenderedOrder(boxGroup);

  let reordered = TestUtils.topicObserved("contextual-identity-reordered");
  performDragAndDrop({
    contentWindow: win,
    dragItem: getItem(boxGroup, id0).handleEl,
    targetItem: getItem(boxGroup, id2),
    position: "after",
  });
  await reordered;

  await assertOrder(
    boxGroup,
    [id1, id2, id0, id3],
    "Dragging the first container after the third one moves it"
  );

  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_reorder_with_keyboard() {
  let { win, boxGroup, tab } = await openContainersPane();
  let [id0, id1, id2, id3] = getRenderedOrder(boxGroup);

  let reordered = TestUtils.topicObserved("contextual-identity-reordered");
  getItem(boxGroup, id3).focus();
  EventUtils.synthesizeKey(
    "KEY_ArrowUp",
    { ctrlKey: true, shiftKey: true },
    win
  );
  await reordered;

  await assertOrder(
    boxGroup,
    [id0, id1, id3, id2],
    "Ctrl+Shift+ArrowUp moves the last container up one position"
  );

  await BrowserTestUtils.removeTab(tab);
});

// The list is rebuilt from the service, so a reorder made elsewhere -- by an
// extension calling contextualIdentities.move(), or by another window -- has to
// show up too.
add_task(async function test_reorder_from_outside_the_pane() {
  let { boxGroup, tab } = await openContainersPane();
  let [id0, id1, id2, id3] = getRenderedOrder(boxGroup);

  let reordered = TestUtils.topicObserved("contextual-identity-reordered");
  ContextualIdentityService.move([id3], 0);
  await reordered;

  await assertOrder(
    boxGroup,
    [id3, id0, id1, id2],
    "A reorder performed outside the pane refreshes the list"
  );

  await BrowserTestUtils.removeTab(tab);
});
