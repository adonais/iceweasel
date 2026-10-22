add_task(async function test() {
  const tabs = [gBrowser.selectedTab];
  for (let i = 0; i < 6; ++i) {
    tabs.push(BrowserTestUtils.addTab(gBrowser));
  }

  // Check that setSuccessor works.
  gBrowser.setSuccessor(tabs[0], tabs[2]);
  is(gBrowser.getSuccessor(tabs[0]), tabs[2], "setSuccessor sets successor");

  BrowserTestUtils.removeTab(tabs[0]);
  is(
    gBrowser.selectedTab,
    tabs[2],
    "When closing a selected tab, select its successor"
  );

  // Check that the successor of a hidden tab becomes the successor of the
  // tab's predecessors.
  gBrowser.setSuccessor(tabs[1], tabs[2]);
  gBrowser.setSuccessor(tabs[3], tabs[1]);

  gBrowser.hideTab(tabs[1]);
  is(
    gBrowser.getSuccessor(tabs[3]),
    tabs[2],
    "A predecessor of a hidden tab should take as its successor the hidden tab's successor"
  );

  gBrowser.showTab(tabs[1]);

  // Check that the successor of a closed tab also becomes the successor of the
  // tab's predecessors.
  gBrowser.setSuccessor(tabs[1], tabs[2]);
  gBrowser.setSuccessor(tabs[3], tabs[1]);

  BrowserTestUtils.removeTab(tabs[1]);
  is(
    gBrowser.getSuccessor(tabs[3]),
    tabs[2],
    "A predecessor of a closed tab should take as its successor the closed tab's successor"
  );

  // Check that clearing a successor makes the browser fall back to selecting
  // the owner or next tab.
  await BrowserTestUtils.switchTab(gBrowser, tabs[3]);
  gBrowser.setSuccessor(tabs[3], null);
  is(
    gBrowser.getSuccessor(tabs[3]),
    null,
    "setSuccessor(..., null) should clear successor"
  );

  BrowserTestUtils.removeTab(tabs[3]);
  is(
    gBrowser.selectedTab,
    tabs[4],
    "When the active tab is closed and its successor has been cleared, select the next tab"
  );

  // Like closing or hiding a tab, moving a tab to another window should also
  // result in its successor becoming the successor of the moved tab's
  // predecessors.
  gBrowser.setSuccessor(tabs[4], tabs[2]);
  gBrowser.setSuccessor(tabs[2], tabs[5]);
  const secondWin = gBrowser.replaceTabsWithWindow(tabs[2]);
  await TestUtils.waitForCondition(
    () => tabs[2].closing,
    "Wait for tab to be transferred"
  );
  is(
    gBrowser.getSuccessor(tabs[4]),
    tabs[5],
    "A predecessor of a tab moved to another window should take as its successor the moved tab's successor"
  );

  // Trying to set a successor across windows should fail.
  let threw = false;
  try {
    gBrowser.setSuccessor(tabs[4], secondWin.gBrowser.selectedTab);
  } catch (ex) {
    threw = true;
  }
  ok(threw, "No cross window successors");
  is(
    gBrowser.getSuccessor(tabs[4]),
    tabs[5],
    "Successor should remain unchanged"
  );

  threw = false;
  try {
    secondWin.gBrowser.setSuccessor(tabs[4], null);
  } catch (ex) {
    threw = true;
  }
  ok(threw, "No setting successors for another window's tab");
  is(
    gBrowser.getSuccessor(tabs[4]),
    tabs[5],
    "Successor should remain unchanged"
  );

  BrowserTestUtils.closeWindow(secondWin);

  // A tab can't be its own successor
  gBrowser.setSuccessor(tabs[4], tabs[4]);
  is(
    gBrowser.getSuccessor(tabs[4]),
    null,
    "Successor should be cleared instead of pointing to itself"
  );

  gBrowser.setSuccessor(tabs[4], tabs[5]);
  gBrowser.setSuccessor(tabs[5], tabs[4]);
  is(
    gBrowser.getSuccessor(tabs[4]),
    tabs[5],
    "Successors can form cycles of length > 1 [a]"
  );
  is(
    gBrowser.getSuccessor(tabs[5]),
    tabs[4],
    "Successors can form cycles of length > 1 [b]"
  );
  BrowserTestUtils.removeTab(tabs[5]);
  is(
    gBrowser.getSuccessor(tabs[4]),
    null,
    "Successor should be cleared instead of pointing to itself"
  );

  gBrowser.removeTab(tabs[4]);
});
