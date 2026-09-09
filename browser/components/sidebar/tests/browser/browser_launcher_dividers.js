/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TRANSPARENT = "rgba(0, 0, 0, 0)";

/**
 * The dividers are drawn with a background-image, so a hidden divider is a
 * splitter which is still laid out and can still be dragged, but doesn't
 * paint anything.
 *
 * @param {Element} splitter
 * @param {boolean} shouldBeVisible
 * @param {string} message
 */
function assertDivider(splitter, shouldBeVisible, message) {
  Assert.ok(
    BrowserTestUtils.isVisible(splitter),
    `${message} (splitter laid out)`
  );
  const { backgroundImage } = window.getComputedStyle(splitter);
  if (shouldBeVisible) {
    Assert.notStrictEqual(backgroundImage, "none", message);
  } else {
    Assert.strictEqual(backgroundImage, "none", message);
  }
}

function getToolsSplitter() {
  return SidebarController.sidebarMain.shadowRoot.getElementById(
    "sidebar-tools-and-extensions-splitter"
  );
}

async function setLauncherExpanded(expanded) {
  SidebarController._state.launcherExpanded = expanded;
  await SidebarController.sidebarMain.updateComplete;
  await waitForRepaint();
  Assert.equal(
    gBrowser.tabContainer.hasAttribute("expanded"),
    expanded,
    `The tab strip is ${expanded ? "expanded" : "collapsed"}`
  );
}

/**
 * @param {Element} splitter
 * @param {boolean} hovered
 */
async function setSplitterHovered(splitter, hovered) {
  if (hovered) {
    EventUtils.synthesizeMouseAtCenter(splitter, { type: "mousemove" }, window);
  } else {
    // The top left corner of the window is never the splitter, which sits
    // below the pinned tabs.
    EventUtils.synthesizeMouse(
      document.documentElement,
      0,
      0,
      { type: "mousemove" },
      window
    );
  }
  await TestUtils.waitForCondition(
    () => splitter.matches(":hover") === hovered,
    `The splitter is ${hovered ? "hovered" : "no longer hovered"}`
  );
  await waitForRepaint();
}

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      [VERTICAL_TABS_PREF, true],
      [SIDEBAR_VISIBILITY_PREF, "always-show"],
      ["sidebar.animation.enabled", false],
    ],
  });
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");

  // The pinned tabs divider is only rendered when there are pinned tabs.
  await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank");
  gBrowser.pinTab(gBrowser.selectedTab);
  await SidebarController.waitUntilStable();
});

registerCleanupFunction(async () => {
  for (const tab of [...gBrowser.tabs]) {
    if (tab.pinned) {
      gBrowser.unpinTab(tab);
    }
  }
  cleanUpExtraTabs();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_dividers_hidden_while_expanded() {
  const pinnedTabsSplitter = SidebarController._pinnedTabsSplitter;

  await setLauncherExpanded(false);
  assertDivider(
    pinnedTabsSplitter,
    true,
    "The pinned tabs divider is drawn while the launcher is collapsed"
  );

  await setLauncherExpanded(true);
  assertDivider(
    pinnedTabsSplitter,
    false,
    "The pinned tabs divider is hidden while the launcher is expanded"
  );
  Assert.strictEqual(
    window.getComputedStyle(pinnedTabsSplitter).borderTopWidth,
    "0px",
    "No line is drawn in place of the hidden pinned tabs divider"
  );

  const toolsSplitter = getToolsSplitter();
  Assert.ok(
    toolsSplitter,
    "The tools and extensions splitter is rendered while the launcher is expanded"
  );
  assertDivider(
    toolsSplitter,
    false,
    "The tools and extensions divider is hidden while the launcher is expanded"
  );
});

add_task(async function test_hidden_divider_is_still_a_drag_target() {
  const pinnedTabsSplitter = SidebarController._pinnedTabsSplitter;

  await setLauncherExpanded(true);
  await setSplitterHovered(pinnedTabsSplitter, false);
  Assert.strictEqual(
    window.getComputedStyle(pinnedTabsSplitter).backgroundColor,
    TRANSPARENT,
    "The hidden pinned tabs divider is unhighlighted while the pointer is away"
  );

  await setSplitterHovered(pinnedTabsSplitter, true);
  const { backgroundColor, backgroundImage } =
    window.getComputedStyle(pinnedTabsSplitter);
  Assert.notStrictEqual(
    backgroundColor,
    TRANSPARENT,
    "Hovering the hidden pinned tabs divider highlights it for dragging"
  );
  Assert.strictEqual(
    backgroundImage,
    "none",
    "Hovering does not redraw the hidden pinned tabs divider"
  );

  await setSplitterHovered(pinnedTabsSplitter, false);
});
