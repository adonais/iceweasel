/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PlacesTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PlacesTestUtils.sys.mjs"
);

let URLs, dates, today, component, contentWindow;

add_setup(async () => {
  const historyInfo = await populateHistory();
  URLs = historyInfo.URLs;
  dates = historyInfo.dates;
  today = dates[0];

  const sidebarInfo = await showHistorySidebar();
  component = sidebarInfo.component;
  contentWindow = sidebarInfo.contentWindow;
});

registerCleanupFunction(() => {
  SidebarController.hide();
  cleanUpExtraTabs();
});

function getSelectedRows(list) {
  const rows = [];
  for (const row of list.rowEls) {
    if (row.selected) {
      rows.push(row);
    }
  }
  return rows;
}

async function clickOnRow(row, event = {}) {
  AccessibilityUtils.setEnv({ focusableRule: false });
  EventUtils.synthesizeMouseAtCenter(row.mainEl, event, contentWindow);
  AccessibilityUtils.resetEnv();
  await component.updateComplete;
}

add_task(async function test_history_deletion_with_delete_or_backspace_key() {
  const tabList = component.lists[0];

  // Wait for history rows to be fully rendered before interacting with them.
  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.rowEls.length === URLs.length
  );
  Assert.equal(tabList.rowEls.length, URLs.length, "History rows are shown.");

  info("Focus the first row and delete it with the Delete key.");
  const deleteHistoryRowPromise = BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.rowEls.length === URLs.length - 1
  );
  tabList.rowEls[0].focus();
  EventUtils.synthesizeKey("KEY_Delete", {}, contentWindow);
  await deleteHistoryRowPromise;
  Assert.equal(
    tabList.rowEls.length,
    URLs.length - 1,
    "Delete key deletes one history row."
  );

  info("Focus the first row and delete it with the Backspace key.");
  const backspaceHistoryRowPromise = BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.rowEls.length === URLs.length - 2
  );
  tabList.rowEls[0].focus();
  EventUtils.synthesizeKey("KEY_Backspace", {}, contentWindow);
  await backspaceHistoryRowPromise;
  Assert.equal(
    tabList.rowEls.length,
    URLs.length - 2,
    "Backspace key deletes one history row."
  );
});

add_task(async function test_history_deletion_with_multiple_selected() {
  // This test must have fresh history to work correctly
  await PlacesUtils.history.clear();
  await populateHistory();

  // Need to wait for the sidebar to refresh with the new history
  await component.controller.updateCache();
  await component.updateComplete;

  const tabList = component.lists[0];

  // Wait for history rows to be fully rendered before interacting with them.
  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.rowEls.length >= 2
  );

  const startingRowCount = tabList.rowEls.length;
  Assert.greater(
    startingRowCount,
    1,
    "There are at least 2 rows for multi-select test."
  );

  info("Select the first row with Accel + Click.");
  await clickOnRow(tabList.rowEls[0], { accelKey: true });
  await BrowserTestUtils.waitForMutationCondition(
    tabList.rowEls[0],
    { attributes: true },
    () => tabList.rowEls[0].selected
  );

  info("Accel + Click the second row to add it to the selection.");
  if (tabList.rowEls.length < 2) {
    info("Not enough rows, skipping multi-select test.");
    return;
  }

  const secondRow = tabList.rowEls[1];
  await clickOnRow(secondRow, { accelKey: true });
  await BrowserTestUtils.waitForMutationCondition(
    secondRow,
    { attributes: true },
    () => secondRow.selected
  );

  const selectedRowsCount = getSelectedRows(tabList).length;
  Assert.equal(selectedRowsCount, 2, "Two rows are selected.");

  // Verify the component recognizes multiple rows are selected
  Assert.ok(
    component.isMultipleRowsSelected,
    "Component recognizes multiple rows as selected."
  );

  info("Press Delete key to trigger multi-select deletion.");
  const selectedItems = component.treeView.getSelectedTabItems();
  Assert.equal(selectedItems.length, 2, "TreeView tracks 2 selected items.");

  // Focus a row and press Delete - the onKeyDown handler should delete all selected rows
  const firstRow = tabList.rowEls[0];
  firstRow.focus();

  const deletePromise = BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.rowEls.length === startingRowCount - 2
  );

  EventUtils.synthesizeKey("KEY_Delete", {}, contentWindow);

  // Wait for the deletion to complete through the keyboard handler
  await deletePromise;

  Assert.equal(
    tabList.rowEls.length,
    startingRowCount - 2,
    "Multi-select deletion removes all selected rows."
  );
});

add_task(async function test_history_deletion_with_nonconsecutive_rows() {
  // Test deletion with non-consecutive (scattered) selection
  await PlacesUtils.history.clear();
  await populateHistory();

  await component.controller.updateCache();
  await component.updateComplete;

  const tabList = component.lists[0];

  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.rowEls.length >= 3
  );

  const startingRowCount = tabList.rowEls.length;
  Assert.greater(
    startingRowCount,
    2,
    "There are at least 3 rows for non-consecutive test."
  );

  info("Select the first row with Accel + Click.");
  await clickOnRow(tabList.rowEls[0], { accelKey: true });
  await BrowserTestUtils.waitForMutationCondition(
    tabList.rowEls[0],
    { attributes: true },
    () => tabList.rowEls[0].selected
  );

  info(
    "Accel + Click the last row (non-consecutive) to add it to the selection."
  );
  const lastRowIndex = tabList.rowEls.length - 1;
  const lastRow = tabList.rowEls[lastRowIndex];
  await clickOnRow(lastRow, { accelKey: true });
  await BrowserTestUtils.waitForMutationCondition(
    lastRow,
    { attributes: true },
    () => lastRow.selected
  );

  const selectedRowsCount = getSelectedRows(tabList).length;
  Assert.equal(selectedRowsCount, 2, "Two non-consecutive rows are selected.");

  info("Press Delete key to trigger non-consecutive deletion.");
  const selectedItems = component.treeView.getSelectedTabItems();
  Assert.equal(selectedItems.length, 2, "TreeView tracks 2 selected items.");

  // Focus a row and press Delete - the onKeyDown handler should delete all selected rows
  const firstRow = tabList.rowEls[0];
  firstRow.focus();

  const deletePromise = BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.rowEls.length === startingRowCount - 2
  );

  EventUtils.synthesizeKey("KEY_Delete", {}, contentWindow);

  // Wait for the deletion to complete through the keyboard handler
  await deletePromise;

  Assert.equal(
    tabList.rowEls.length,
    startingRowCount - 2,
    "Deletion removes both non-consecutive rows."
  );
});

add_task(async function test_history_deletion_with_shift_arrow_selection() {
  // Test deletion with Shift + Arrow keyboard selection
  await PlacesUtils.history.clear();
  await populateHistory();

  await component.controller.updateCache();
  await component.updateComplete;

  const tabList = component.lists[0];

  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.rowEls.length >= 2
  );

  const startingRowCount = tabList.rowEls.length;
  Assert.greater(
    startingRowCount,
    1,
    "There are at least 2 rows for Shift + Arrow test."
  );

  info("Focus the first row.");
  tabList.rowEls[0].focus();

  info("Select first row with Space.");
  EventUtils.synthesizeKey(" ", {}, contentWindow);
  await TestUtils.waitForCondition(
    () => tabList.rowEls[0].selected,
    "First row is selected."
  );

  info("Shift + ArrowDown to select the second row.");
  EventUtils.synthesizeKey("KEY_ArrowDown", { shiftKey: true }, contentWindow);
  await TestUtils.waitForCondition(
    () => getSelectedRows(tabList).length === 2,
    "Two rows are selected with Shift + Arrow."
  );

  const selectedRowsCount = getSelectedRows(tabList).length;
  Assert.equal(selectedRowsCount, 2, "Two rows selected via Shift + Arrow.");

  info("Press Delete key to trigger Shift + Arrow selected deletion.");
  const selectedItems = component.treeView.getSelectedTabItems();
  Assert.equal(selectedItems.length, 2, "TreeView tracks 2 selected items.");

  const deletePromise = BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.rowEls.length === startingRowCount - 2
  );

  // Press Delete while a row is focused - the onKeyDown handler should delete all selected rows
  EventUtils.synthesizeKey("KEY_Delete", {}, contentWindow);

  // Wait for the deletion to complete through the keyboard handler
  await deletePromise;

  Assert.equal(
    tabList.rowEls.length,
    startingRowCount - 2,
    "Deletion removes Shift + Arrow selected rows."
  );
});
