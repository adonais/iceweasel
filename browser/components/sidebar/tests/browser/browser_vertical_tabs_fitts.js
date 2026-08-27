/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.revamp", true],
      ["sidebar.verticalTabs", true],
      ["sidebar.animation.enabled", false],
      ["browser.newtabpage.enabled", false],
    ],
  });
  await SidebarController.waitUntilStable();
});

/**
 * Adds a new tab by clicking on the leading (horizontal) edge of the new tab
 * button's container.
 *
 * @param {Element} newTabButton
 */
async function openTabFromLeadingEdge(newTabButton) {
  const rect = newTabButton.getBoundingClientRect();
  const marginStart = parseFloat(
    getComputedStyle(newTabButton).marginInlineStart
  );
  const x = rect.left - marginStart + 1;
  const y = rect.top + rect.height / 2;

  info(`Clicking the new tab button at the leading-edge pixel (${x}, ${y})`);
  const promiseNewTab = BrowserTestUtils.waitForEvent(
    gBrowser.tabContainer,
    "TabOpen"
  );
  EventUtils.synthesizeMouseAtPoint(x, y, {}, window);

  const { target: newTab } = await promiseNewTab;
  info("A new tab was opened.");
  BrowserTestUtils.removeTab(newTab);
}

add_task(async function test_inline_newtab_button_fitts_leading_edge() {
  const newTabButton = document.getElementById("tabs-newtab-button");
  Assert.ok(
    BrowserTestUtils.isVisible(newTabButton),
    "The inline new tab button is visible when not overflowing"
  );
  await openTabFromLeadingEdge(newTabButton);
});

add_task(async function test_overflow_newtab_button_fitts_leading_edge() {
  await BrowserTestUtils.overflowTabs(registerCleanupFunction, window, {
    overflowAtStart: false,
    overflowTabFactor: 3,
  });
  await TestUtils.waitForCondition(
    () => Array.from(gBrowser.tabs).every(tab => tab._fullyOpen),
    "Tabs are fully open"
  );
  Assert.ok(
    gBrowser.tabContainer.arrowScrollbox.overflowing,
    "The vertical tab strip is overflowing"
  );

  // When overflowing, the inline button is hidden and overflow button takes over.
  const newTabButton = document.getElementById("vertical-tabs-newtab-button");
  Assert.ok(
    BrowserTestUtils.isVisible(newTabButton),
    "The overflow new tab button is visible while overflowing"
  );
  await openTabFromLeadingEdge(newTabButton);

  // Remove the extra tabs causing overflow.
  cleanUpExtraTabs();
});
