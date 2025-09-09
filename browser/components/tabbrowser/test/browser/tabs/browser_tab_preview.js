/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// NOTE on usage of sinon spies with THP components
// since THP is lazy-loaded, the tab hover preview component *must*
// be activated at least once in each test prior to setting up
// any spies against this component.
// Since each test reuses the same window, generally this issue will only
// be made evident in chaos-mode tests that run out of order (and
// thus will result in an intermittent).
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const { TabStateFlusher } = ChromeUtils.importESModule(
  "resource:///modules/sessionstore/TabStateFlusher.sys.mjs"
);

const TabHoverPanelSet = ChromeUtils.importESModule(
  "chrome://browser/content/tabbrowser/tab-hover-preview.mjs"
).default;

const TAB_PREVIEW_PANEL_ID = "tab-preview-panel";
const TAB_GROUP_PREVIEW_PANEL_ID = "tabgroup-preview-panel";

async function openTabPreview(tab, win = window) {
  const previewShown = BrowserTestUtils.waitForPopupEvent(
    win.document.getElementById(TAB_PREVIEW_PANEL_ID),
    "shown"
  );
  EventUtils.synthesizeMouse(tab, 1, 1, { type: "mouseover" }, win);
  return previewShown;
}

async function closeTabPreviews(win = window) {
  const tabs = win.document.getElementById("tabbrowser-tabs");
  const previewHidden = BrowserTestUtils.waitForPopupEvent(
    win.document.getElementById(TAB_PREVIEW_PANEL_ID),
    "hidden"
  );
  EventUtils.synthesizeMouse(
    tabs,
    0,
    tabs.outerHeight + 1,
    {
      type: "mouseout",
    },
    win
  );
  return previewHidden;
}

async function openGroupPreview(group, win = window) {
  const previewElement = win.document.getElementById(
    TAB_GROUP_PREVIEW_PANEL_ID
  );
  Assert.ok(previewElement.state, "closed");

  const previewShown = BrowserTestUtils.waitForPopupEvent(
    previewElement,
    "shown"
  );
  EventUtils.synthesizeMouseAtCenter(
    group.labelElement,
    { type: "mouseover" },
    win
  );
  return previewShown;
}

async function closeGroupPreviews(win = window) {
  const tabs = win.document.getElementById("tabbrowser-tabs");
  const previewHidden = BrowserTestUtils.waitForPopupEvent(
    win.document.getElementById(TAB_GROUP_PREVIEW_PANEL_ID),
    "hidden"
  );
  EventUtils.synthesizeMouse(
    tabs,
    0,
    tabs.outerHeight + 1,
    {
      type: "mouseout",
    },
    win
  );
  return previewHidden;
}

function getOpenPanels() {
  return document.querySelectorAll(
    "panel[panelopen=true],panel[animating=true],menupopup[open=true]"
  );
}

async function resetState() {
  // Ensure the mouse is not hovering over the tab strip.
  EventUtils.synthesizeMouseAtCenter(document.documentElement, {
    type: "mouseover",
  });

  for (let panel of getOpenPanels()) {
    let hiddenEvent = BrowserTestUtils.waitForPopupEvent(panel, "hidden");
    panel.hidePopup();
    await hiddenEvent;
  }

  let openPanels = getOpenPanels();
  Assert.ok(!openPanels.length, `sanity check: no panels open`);
}

function createFakePanel(win = window) {
  let panel = win.document.createXULElement("panel");
  // Necessary to get the panel open, animating, etc. elements to appear.
  panel.setAttribute("type", "arrow");
  win.document.documentElement.appendChild(panel);

  return panel;
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.tabs.groups.hoverPreview.enabled", true],
      ["browser.tabs.hoverPreview.enabled", true],
      ["browser.tabs.hoverPreview.showThumbnails", false],
      ["browser.tabs.tooltipsShowPidAndActiveness", false],
      ["sidebar.revamp", false],
      ["sidebar.verticalTabs", false],
      ["test.wait300msAfterTabSwitch", true],
      ["ui.tooltip.delay_ms", 0],
    ],
  });

  await resetState();
  registerCleanupFunction(async function () {
    await resetState();
  });
});

/*
 * The tests in this file are split into three groups:
 * 1. Tests dealing specifically with the tab hover preview (THP) panel
 * 2. Tests dealing specifically with the tab group hover preview (TGHP) panel
 * 3. Tests that verify functionality of both kinds of preview, or that test
 *    logic that is used by the main PanelSet component (i.e. is shared code
 *    for both kinds of preview)
 */

/*
 * Tab hover preview tests
 * -----------------------
 */

/**
 * Verify the following:
 *
 * 1. Tab preview card appears when the mouse hovers over a tab
 * 2. Tab preview card shows the correct preview for the tab being hovered
 * 3. Tab preview card is dismissed when the mouse leaves the tab bar
 */
add_task(async function tabHoverTests() {
  const tabUrl1 =
    "data:text/html,<html><head><title>First New Tab</title></head><body>Hello</body></html>";
  const tab1 = await BrowserTestUtils.openNewForegroundTab(gBrowser, tabUrl1);
  const tabUrl2 =
    "data:text/html,<html><head><title>Second New Tab</title></head><body>Hello</body></html>";
  const tab2 = await BrowserTestUtils.openNewForegroundTab(gBrowser, tabUrl2);
  const previewContainer = document.getElementById(TAB_PREVIEW_PANEL_ID);

  await openTabPreview(tab1);
  Assert.equal(
    previewContainer.querySelector(".tab-preview-title").innerText,
    "First New Tab",
    "Preview of tab1 shows correct title"
  );
  await closeTabPreviews();

  await openTabPreview(tab2);
  Assert.equal(
    previewContainer.querySelector(".tab-preview-title").innerText,
    "Second New Tab",
    "Preview of tab2 shows correct title"
  );
  await closeTabPreviews();

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);

  await resetState();
});

/**
 * Tab preview should be dismissed when a new tab is focused/selected
 */
add_task(async function tabFocusTests() {
  const tab1 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const tab2 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const previewPanel = document.getElementById(TAB_PREVIEW_PANEL_ID);

  await openTabPreview(tab1);
  Assert.equal(previewPanel.state, "open", "Preview is open");

  let previewHidden = BrowserTestUtils.waitForPopupEvent(
    previewPanel,
    "hidden"
  );
  tab1.click();
  await previewHidden;
  Assert.equal(
    previewPanel.state,
    "closed",
    "Preview is closed after selecting tab"
  );

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);

  await resetState();
});

/**
 * Verify that the pid and activeness statuses are not shown
 * when the flag is not enabled.
 */
add_task(async function tabPidAndActivenessHiddenByDefaultTests() {
  const tabUrl1 =
    "data:text/html,<html><head><title>First New Tab</title></head><body>Hello</body></html>";
  const tab1 = await BrowserTestUtils.openNewForegroundTab(gBrowser, tabUrl1);
  const previewContainer = document.getElementById(TAB_PREVIEW_PANEL_ID);

  await openTabPreview(tab1);
  Assert.equal(
    previewContainer.querySelector(".tab-preview-pid").innerText,
    "",
    "Tab PID is not shown"
  );
  Assert.equal(
    previewContainer.querySelector(".tab-preview-activeness").innerText,
    "",
    "Tab activeness is not shown"
  );

  await closeTabPreviews();
  BrowserTestUtils.removeTab(tab1);
  await resetState();
});

add_task(async function tabPidAndActivenessTests() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.tooltipsShowPidAndActiveness", true]],
  });

  const tabUrl1 =
    "data:text/html,<html><head><title>Single process tab</title></head><body>Hello</body></html>";
  const tab1 = await BrowserTestUtils.openNewForegroundTab(gBrowser, tabUrl1);
  const tabUrl2 = `data:text/html,<html>
      <head>
        <title>Multi-process tab</title>
      </head>
      <body>
        <iframe
          id="inlineFrameExample"
          title="Inline Frame Example"
          width="300"
          height="200"
          src="https://example.com">
        </iframe>
      </body>
    </html>`;
  const tab2 = await BrowserTestUtils.openNewForegroundTab(gBrowser, tabUrl2);
  const previewContainer = document.getElementById(TAB_PREVIEW_PANEL_ID);

  await openTabPreview(tab1);
  Assert.stringMatches(
    previewContainer.querySelector(".tab-preview-pid").innerText,
    /^pid: \d+$/,
    "Tab PID is shown on single process tab"
  );
  Assert.equal(
    previewContainer.querySelector(".tab-preview-activeness").innerText,
    "",
    "Tab activeness is not shown on inactive tab"
  );
  await closeTabPreviews();

  await openTabPreview(tab2);
  Assert.stringMatches(
    previewContainer.querySelector(".tab-preview-pid").innerText,
    /^pids: \d+, \d+$/,
    "Tab PIDs are shown on multi-process tab"
  );
  Assert.equal(
    previewContainer.querySelector(".tab-preview-activeness").innerText,
    "[A]",
    "Tab activeness is shown on active tab"
  );
  await closeTabPreviews();

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
  await SpecialPowers.popPrefEnv();
  await resetState();
});

/**
 * Verify that non-selected tabs display a thumbnail in their preview
 * when browser.tabs.hoverPreview.showThumbnails is set to true,
 * while the currently selected tab never displays a thumbnail in its preview.
 */
add_task(async function tabThumbnailTests() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.hoverPreview.showThumbnails", true]],
  });
  const tabUrl1 = "about:blank";
  const tab1 = await BrowserTestUtils.openNewForegroundTab(gBrowser, tabUrl1);
  const tabUrl2 = "about:blank";
  const tab2 = await BrowserTestUtils.openNewForegroundTab(gBrowser, tabUrl2);
  const previewPanel = document.getElementById(TAB_PREVIEW_PANEL_ID);

  let thumbnailUpdated = BrowserTestUtils.waitForEvent(
    previewPanel,
    "previewThumbnailUpdated",
    false,
    evt => evt.detail.thumbnail
  );
  await openTabPreview(tab1);
  await thumbnailUpdated;
  Assert.ok(
    previewPanel.querySelectorAll(
      ".tab-preview-thumbnail-container img, .tab-preview-thumbnail-container canvas"
    ).length,
    "Tab1 preview contains thumbnail"
  );

  await closeTabPreviews();
  thumbnailUpdated = BrowserTestUtils.waitForEvent(
    previewPanel,
    "previewThumbnailUpdated"
  );
  await openTabPreview(tab2);
  await thumbnailUpdated;
  Assert.equal(
    previewPanel.querySelectorAll(
      ".tab-preview-thumbnail-container img, .tab-preview-thumbnail-container canvas"
    ).length,
    0,
    "Tab2 (selected) does not contain thumbnail"
  );

  const previewHidden = BrowserTestUtils.waitForPopupEvent(
    previewPanel,
    "hidden"
  );

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
  await SpecialPowers.popPrefEnv();

  // Removing the tab should close the preview.
  await previewHidden;
  await resetState();
});

/**
 * Verify that non-selected tabs display a wireframe in their preview
 * when enabled, and the tab is unable to provide a thumbnail (e.g. unloaded).
 */
add_task(async function tabWireframeTests() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.tabs.hoverPreview.showThumbnails", true],
      ["browser.history.collectWireframes", true],
    ],
  });

  const tab1 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "data:text/html,<html><head><title>First New Tab</title></head><body>Hello</body></html>"
  );
  const tab2 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  // Discard the first tab so it can't provide a thumbnail image
  await TabStateFlusher.flush(tab1.linkedBrowser);
  gBrowser.discardBrowser(tab1, true);

  const previewPanel = document.getElementById(TAB_PREVIEW_PANEL_ID);

  let thumbnailUpdated = BrowserTestUtils.waitForEvent(
    previewPanel,
    "previewThumbnailUpdated",
    false,
    evt => evt.detail.thumbnail
  );
  await openTabPreview(tab1);
  await thumbnailUpdated;
  Assert.ok(
    previewPanel.querySelectorAll(".tab-preview-thumbnail-container svg")
      .length,
    "Tab1 preview contains wireframe"
  );

  const previewHidden = BrowserTestUtils.waitForPopupEvent(
    previewPanel,
    "hidden"
  );

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
  await SpecialPowers.popPrefEnv();

  // Removing the tab should close the preview.
  await previewHidden;
  await resetState();
});

/**
 * preview should be hidden if it is showing when the URLBar receives input
 */
add_task(async function tabUrlBarInputTests() {
  const previewElement = document.getElementById(TAB_PREVIEW_PANEL_ID);
  const tab1 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  await openTabPreview(tab1);
  gURLBar.focus();
  Assert.equal(previewElement.state, "open", "Preview is open");

  let previewHidden = BrowserTestUtils.waitForEvent(
    previewElement,
    "popuphidden"
  );
  EventUtils.sendChar("q", window);
  await previewHidden;

  Assert.equal(previewElement.state, "closed", "Preview is closed");
  await closeTabPreviews();
  await openTabPreview(tab1);
  Assert.equal(previewElement.state, "open", "Preview is open");

  previewHidden = BrowserTestUtils.waitForEvent(previewElement, "popuphidden");
  EventUtils.sendChar("q", window);
  await previewHidden;
  Assert.equal(previewElement.state, "closed", "Preview is closed");

  BrowserTestUtils.removeTab(tab1);
  await resetState();
});

/**
 * The tab panel should be configured to roll up on wheel events if
 * the tab strip is overflowing.
 */
add_task(async function tabWheelTests() {
  const previewPanel = document.getElementById(TAB_PREVIEW_PANEL_ID);
  const tab1 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  Assert.ok(
    !previewPanel.hasAttribute("rolluponmousewheel"),
    "Panel does not have rolluponmousewheel when no overflow"
  );

  let scrollOverflowEvent = BrowserTestUtils.waitForEvent(
    gBrowser.tabContainer.arrowScrollbox,
    "overflow"
  );
  BrowserTestUtils.overflowTabs(registerCleanupFunction, window, {
    overflowAtStart: false,
  });
  await scrollOverflowEvent;
  await openTabPreview(tab1);

  Assert.equal(
    previewPanel.getAttribute("rolluponmousewheel"),
    "true",
    "Panel has rolluponmousewheel=true when tabs overflow"
  );

  // Clean up extra tabs
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs[0]);
  }
  await resetState();
});

add_task(async function tabPanelAppearsAsTooltipToAccessibilityToolsTests() {
  const previewPanel = document.getElementById(TAB_PREVIEW_PANEL_ID);
  Assert.equal(
    previewPanel.getAttribute("role"),
    "tooltip",
    "The panel appears as a tooltip to assistive technology"
  );
  await resetState();
});

/**
 * Verify that if the browser document title (i.e. tab label) changes,
 * the tab preview panel is updated
 */
add_task(async function tabContentChangeTests() {
  const previewPanel = document.getElementById(TAB_PREVIEW_PANEL_ID);

  const tabUrl =
    "data:text/html,<html><head><title>Original Tab Title</title></head><body>Hello</body></html>";
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, tabUrl);

  await openTabPreview(tab);
  Assert.equal(
    previewPanel.querySelector(".tab-preview-title").innerText,
    "Original Tab Title",
    "Preview of tab shows original tab title"
  );

  tab.setAttribute("label", "New Tab Title");

  await BrowserTestUtils.waitForCondition(() => {
    return (
      previewPanel.querySelector(".tab-preview-title").innerText ===
      "New Tab Title"
    );
  });

  Assert.equal(
    previewPanel.querySelector(".tab-preview-title").innerText,
    "New Tab Title",
    "Preview of tab shows new tab title"
  );

  await closeTabPreviews();
  BrowserTestUtils.removeTab(tab);
  await resetState();
});

/*
 * Tab group hover preview tests
 * -----------------------------
 */

add_task(async function tabGroupPanelAppearsOnTabGroupHover() {
  const tab1 = await addTabTo(gBrowser, "about:robots");
  const tab2 = await addTabTo(gBrowser, "about:mozilla");

  const group = gBrowser.addTabGroup([tab1, tab2]);
  group.collapsed = true;

  // Tabs from the control group should not appear in the list
  const controlTab = await addTabTo(gBrowser, "https://example.com/");
  const controlGroup = gBrowser.addTabGroup([controlTab]);
  controlGroup.collapsed = true;

  await openGroupPreview(group);

  const previewPanel = window.document.getElementById(
    TAB_GROUP_PREVIEW_PANEL_ID
  );

  Assert.equal(
    previewPanel.children.length,
    2,
    "Preview panel has one menuitem for each tab in the group"
  );
  Assert.equal(
    previewPanel.children[0].tagName,
    "menuitem",
    "First child is a menuitem"
  );
  Assert.equal(
    previewPanel.children[0].label,
    tab1.label,
    "First child has correct label"
  );
  Assert.equal(
    previewPanel.children[0].getAttribute("tooltiptext"),
    previewPanel.children[0].label,
    "First child has a tooltip that is identical to the label"
  );
  Assert.equal(
    previewPanel.children[1].tagName,
    "menuitem",
    "Second child is a menuitem"
  );
  Assert.equal(
    previewPanel.children[1].label,
    tab2.label,
    "Second child has correct label"
  );
  Assert.equal(
    previewPanel.children[1].getAttribute("tooltiptext"),
    previewPanel.children[1].label,
    "Second child has a tooltip that is identical to the label"
  );

  await closeGroupPreviews();

  await removeTabGroup(group);
  await removeTabGroup(controlGroup);
  await resetState();
});

add_task(async function tabGroupPanelDoesNotAppearForExpandedTabGroups() {
  const group = gBrowser.addTabGroup([
    BrowserTestUtils.addTab(gBrowser, "about:robots"),
  ]);
  group.collapsed = true;

  // Panel must be opened at least once to ensure the component is lazy-loaded
  await openGroupPreview(group);
  await closeGroupPreviews();

  const previewPanelComponent = window.gBrowser.tabContainer.previewPanel;

  Assert.notEqual(
    previewPanelComponent,
    null,
    "Sanity check: preview panel component is loaded"
  );
  Assert.equal(
    previewPanelComponent.tabPanel.panelElement.state,
    "closed",
    "Sanity check: tab preview panel is closed"
  );
  Assert.equal(
    previewPanelComponent.tabGroupPanel.panelElement.state,
    "closed",
    "Sanity check: tab group preview panel is closed"
  );

  sinon.spy(previewPanelComponent, "activate");

  group.collapsed = false;

  EventUtils.synthesizeMouseAtCenter(
    group.labelElement,
    { type: "mouseover" },
    window
  );
  await BrowserTestUtils.waitForCondition(() => {
    return previewPanelComponent.activate.calledOnce;
  }, "Waiting for activate to be called");

  Assert.equal(
    previewPanelComponent.tabGroupPanel.panelElement.state,
    "closed",
    "Group preview panel does not open on an expanded tab group"
  );

  await removeTabGroup(group);
  sinon.restore();
  await resetState();
});

add_task(async function tabGroupPanelExpandDismissesPanel() {
  const tab1 = await addTabTo(gBrowser, "about:robots");
  const group = gBrowser.addTabGroup([tab1]);
  group.collapsed = true;

  await openGroupPreview(group);

  const previewPanel = window.document.getElementById(
    TAB_GROUP_PREVIEW_PANEL_ID
  );

  Assert.equal(
    previewPanel.state,
    "open",
    "sanity check: tab group preview panel is open"
  );

  const previewHidden = BrowserTestUtils.waitForPopupEvent(
    previewPanel,
    "hidden"
  );
  EventUtils.synthesizeMouseAtCenter(group.labelElement, {});
  await previewHidden;

  Assert.equal(
    previewPanel.state,
    "closed",
    "tab group preview panel closes on tab label click"
  );

  await removeTabGroup(group);
  await resetState();
});

add_task(
  {
    skip_if: () => AppConstants.platform == "macosx", // bug1982893
  },
  async function tabGroupPanelClickElementSwitchesTabs() {
    const tabs = [
      BrowserTestUtils.addTab(gBrowser, "about:robots"),
      BrowserTestUtils.addTab(gBrowser, "about:mozilla"),
    ];
    const group = gBrowser.addTabGroup(tabs);
    group.collapsed = true;

    Assert.equal(
      gBrowser.selectedTab,
      gBrowser.tabs[0],
      "Selected tab is first tab on tab strip before clicking the panel item"
    );

    await openGroupPreview(group);
    const previewPanel = window.document.getElementById(
      TAB_GROUP_PREVIEW_PANEL_ID
    );

    EventUtils.synthesizeMouseAtCenter(previewPanel.children[1], {}, window);

    await BrowserTestUtils.waitForCondition(() => {
      return gBrowser.selectedTab != gBrowser.tabs[0];
    }, "Waiting for selected tab to change");
    Assert.equal(previewPanel.state, "closed");
    Assert.equal(
      gBrowser.selectedTab,
      gBrowser.tabs[2],
      "Selected tab is second tab within the tab group after clicking panel item"
    );
    Assert.ok(
      group.collapsed,
      "Group is still in collapsed state even though it has the active tab"
    );

    await removeTabGroup(group);
    await resetState();
  }
);

/*
 * Shared tests
 * ------------
 */

// Bug 1897475 - don't show tab previews in background windows
// TODO Bug 1899556: If possible, write a test to confirm tab previews
// aren't shown when /all/ windows are in the background
add_task(async function noPreviewInBackgroundWindowTests() {
  const bgWindow = window;
  const bgTabUngrouped = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  const bgTabGrouped = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  const bgGroup = gBrowser.addTabGroup([bgTabGrouped]);
  bgGroup.collapsed = true;

  // tab must be opened at least once to ensure that bgWindow tab preview lazy loads
  await openTabPreview(bgTabUngrouped, bgWindow);
  await closeTabPreviews(bgWindow);

  const bgPreviewComponent = bgWindow.gBrowser.tabContainer.previewPanel;
  sinon.spy(bgPreviewComponent, "activate");

  let fgWindow = await BrowserTestUtils.openNewBrowserWindow();
  let fgTab = fgWindow.gBrowser.tabs[0];
  let fgWindowPreviewContainer =
    fgWindow.document.getElementById(TAB_PREVIEW_PANEL_ID);

  await openTabPreview(fgTab, fgWindow);
  Assert.equal(
    fgWindowPreviewContainer.querySelector(".tab-preview-title").innerText,
    "New Tab",
    "Preview of foreground tab shows correct title"
  );
  await closeTabPreviews(fgWindow);

  // ensure ungrouped tab's preview doesn't open, as it's now in a background window
  EventUtils.synthesizeMouseAtCenter(
    bgTabUngrouped,
    { type: "mouseover" },
    bgWindow
  );
  await BrowserTestUtils.waitForCondition(() => {
    return bgPreviewComponent.activate.calledOnce;
  }, "Waiting for activate to be called on bgPreviewComponent after hovering ungrouped tab");
  Assert.equal(
    bgPreviewComponent.tabPanel.panelElement.state,
    "closed",
    "preview does not open from background window"
  );

  bgPreviewComponent.activate.resetHistory();
  Assert.ok(
    !bgPreviewComponent.activate.calledOnce,
    "sanity check that spy has no history"
  );

  // ensure group's preview doesn't open, as it's now in a background window
  EventUtils.synthesizeMouseAtCenter(
    bgGroup.labelElement,
    { type: "mouseover" },
    bgWindow
  );
  await BrowserTestUtils.waitForCondition(() => {
    return bgPreviewComponent.activate.calledOnce;
  }, "Waiting for activate to be called on bgPreviewComponent after hovering grouped tab label");
  Assert.equal(
    bgPreviewComponent.tabGroupPanel.panelElement.state,
    "closed",
    "preview does not open from background window"
  );

  BrowserTestUtils.removeTab(fgTab);
  await BrowserTestUtils.closeWindow(fgWindow);

  BrowserTestUtils.removeTab(bgTabUngrouped);
  BrowserTestUtils.removeTab(bgTabGrouped);

  sinon.restore();
  await resetState();
});

/**
 * make sure delay is applied when mouse leaves tabstrip
 * but not when moving between tabs on the tabstrip
 */
add_task(async function delayTests() {
  const tabUrl1 =
    "data:text/html,<html><head><title>First New Tab</title></head><body>Hello</body></html>";
  const tab1 = await BrowserTestUtils.openNewForegroundTab(gBrowser, tabUrl1);
  const tabUrl2 =
    "data:text/html,<html><head><title>Second New Tab</title></head><body>Hello</body></html>";
  const tab2 = await BrowserTestUtils.openNewForegroundTab(gBrowser, tabUrl2);
  const previewElement = document.getElementById(TAB_PREVIEW_PANEL_ID);

  await openTabPreview(tab1);

  const previewComponent = gBrowser.tabContainer.previewPanel;
  sinon.spy(previewComponent, "deactivate");

  // I can't fake this like in hoverTests, need to send an updated-tab signal
  //await openPreview(tab2);

  const previewHidden = BrowserTestUtils.waitForPopupEvent(
    previewElement,
    "hidden"
  );
  Assert.ok(
    !previewComponent.deactivate.called,
    "Delay is not reset when moving between tabs"
  );

  EventUtils.synthesizeMouseAtCenter(document.getElementById("reload-button"), {
    type: "mousemove",
  });

  await previewHidden;

  Assert.ok(
    previewComponent.deactivate.called,
    "Delay is reset when cursor leaves tabstrip"
  );

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
  sinon.restore();
  await resetState();
});

/**
 * Quickly moving the mouse off and back on to the tab strip should
 * not reset the delay
 */
add_task(async function zeroDelayTests() {
  await SpecialPowers.pushPrefEnv({
    set: [["ui.tooltip.delay_ms", 1000]],
  });

  const tabUrl =
    "data:text/html,<html><head><title>First New Tab</title></head><body>Hello</body></html>";
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, tabUrl);

  await openTabPreview(tab);
  await closeTabPreviews();

  let resolved = false;
  let openPreviewPromise = openTabPreview(tab).then(() => {
    resolved = true;
  });
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  let timeoutPromise = new Promise(resolve => setTimeout(resolve, 300));
  await Promise.race([openPreviewPromise, timeoutPromise]);

  Assert.ok(resolved, "Zero delay is set immediately after leaving tab strip");

  await closeTabPreviews();
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
  await resetState();
});

/**
 * Dragging a tab or a tab group should deactivate the preview
 */
add_task(async function testDragToCancelPreview() {
  await SpecialPowers.pushPrefEnv({
    set: [["ui.tooltip.delay_ms", 1000]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  const previewElement = document.getElementById(TAB_PREVIEW_PANEL_ID);

  await openTabPreview(tab);

  const previewComponent = gBrowser.tabContainer.previewPanel;
  sinon.spy(previewComponent, "deactivate");

  let previewHidden = BrowserTestUtils.waitForPopupEvent(
    previewElement,
    "hidden"
  );
  let dragend = BrowserTestUtils.waitForEvent(tab, "dragend");

  EventUtils.synthesizePlainDragAndDrop({
    srcElement: tab,
    destElement: null,
    stepX: 5,
    stepY: 0,
  });

  await previewHidden;

  Assert.ok(
    previewComponent.deactivate.called,
    "deactivate is called after tab drag started"
  );

  await dragend;

  const group = gBrowser.addTabGroup([tab]);
  group.collapsed = true;
  await openGroupPreview(group);

  previewComponent.deactivate.resetHistory();

  const groupPreviewElement = document.getElementById(
    TAB_GROUP_PREVIEW_PANEL_ID
  );

  previewHidden = BrowserTestUtils.waitForPopupEvent(
    groupPreviewElement,
    "hidden"
  );
  dragend = BrowserTestUtils.waitForEvent(group.labelElement, "dragend");
  EventUtils.synthesizePlainDragAndDrop({
    srcElement: group.labelElement,
    destElement: null,
    stepX: 10,
    stepY: 0,
  });
  await dragend;
  await previewHidden;

  Assert.ok(
    previewComponent.deactivate.called,
    "deactivate is called after group drag started"
  );

  // TODO not sure why I need to explicitly wait for this, but the drag tests fail without it
  await BrowserTestUtils.waitForCondition(
    () => !previewElement.getAttribute("animating")
  );

  await resetState();
  BrowserTestUtils.removeTab(tab);
  sinon.restore();
  await SpecialPowers.popPrefEnv();
});

/**
 * Other open panels should prevent tab preview from opening
 */
add_task(async function panelSuppressionOnPanelTests() {
  const ungroupedTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  const groupedTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  const group = gBrowser.addTabGroup([groupedTab]);
  group.collapsed = true;

  // tab preview must be opened at least once to ensure that tab preview lazy loads
  await openTabPreview(ungroupedTab);
  await closeTabPreviews();

  const previewComponent = gBrowser.tabContainer.previewPanel;
  sinon.spy(previewComponent, "activate");

  let fakePanel = createFakePanel();
  const popupShownEvent = BrowserTestUtils.waitForPopupEvent(
    fakePanel,
    "shown"
  );
  fakePanel.openPopup();
  await popupShownEvent;

  EventUtils.synthesizeMouseAtCenter(
    ungroupedTab,
    { type: "mouseover" },
    window
  );
  await BrowserTestUtils.waitForCondition(() => {
    return previewComponent.activate.calledOnce;
  });
  Assert.equal(previewComponent.tabPanel.panelElement.state, "closed", "");
  Assert.equal(previewComponent.tabGroupPanel.panelElement.state, "closed", "");

  previewComponent.activate.resetHistory();
  Assert.ok(
    !previewComponent.activate.called,
    "sanity check that spy has no history"
  );

  EventUtils.synthesizeMouseAtCenter(
    group.labelElement,
    { type: "mouseover" },
    window
  );
  await BrowserTestUtils.waitForCondition(() => {
    return previewComponent.activate.calledOnce;
  });
  Assert.equal(previewComponent.tabPanel.panelElement.state, "closed", "");
  Assert.equal(previewComponent.tabGroupPanel.panelElement.state, "closed", "");

  const popupHiddenEvent = BrowserTestUtils.waitForPopupEvent(
    fakePanel,
    "hidden"
  );
  fakePanel.hidePopup();
  await popupHiddenEvent;

  BrowserTestUtils.removeTab(ungroupedTab);
  BrowserTestUtils.removeTab(groupedTab);
  fakePanel.remove();
  sinon.restore();
  await resetState();
});

/**
 * Other open context menus should prevent tab preview from opening
 */
add_task(async function panelSuppressionOnContextMenuTests() {
  const ungroupedTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  const groupedTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  const group = gBrowser.addTabGroup([groupedTab]);
  group.collapsed = true;

  // tab preview must be opened at least once to ensure that tab preview lazy loads
  await openTabPreview(ungroupedTab);
  await closeTabPreviews();

  const previewComponent = gBrowser.tabContainer.previewPanel;
  sinon.spy(previewComponent, "activate");

  // Open a context menu.
  const contentAreaContextMenu = document.getElementById(
    "contentAreaContextMenu"
  );
  const contextMenuShown = BrowserTestUtils.waitForPopupEvent(
    contentAreaContextMenu,
    "shown"
  );
  EventUtils.synthesizeMouseAtCenter(
    document.documentElement,
    { type: "contextmenu" },
    window
  );
  await contextMenuShown;

  // Mouse over a tab.
  EventUtils.synthesizeMouseAtCenter(
    ungroupedTab,
    { type: "mouseover" },
    window
  );
  await BrowserTestUtils.waitForCondition(() => {
    return previewComponent.activate.called;
  });
  Assert.equal(previewComponent.tabPanel.panelElement.state, "closed", "");
  Assert.equal(previewComponent.tabGroupPanel.panelElement.state, "closed", "");

  previewComponent.activate.resetHistory();
  Assert.ok(
    !previewComponent.activate.calledOnce,
    "sanity check that spy has no history"
  );

  // Mouse over a tab group.
  EventUtils.synthesizeMouseAtCenter(
    group.labelElement,
    { type: "mouseover" },
    window
  );
  await BrowserTestUtils.waitForCondition(() => {
    return previewComponent.activate.called;
  });
  Assert.equal(previewComponent.tabPanel.panelElement.state, "closed", "");
  Assert.equal(previewComponent.tabGroupPanel.panelElement.state, "closed", "");

  const contextMenuHidden = BrowserTestUtils.waitForPopupEvent(
    contentAreaContextMenu,
    "hidden"
  );
  contentAreaContextMenu.hidePopup();
  await contextMenuHidden;

  BrowserTestUtils.removeTab(ungroupedTab);
  BrowserTestUtils.removeTab(groupedTab);
  sinon.restore();
  await resetState();
});

/**
 * Ensure that the panel does not open when other panels are active or are in
 * the process of being activated, when THP is being called for the first time
 * (lazy-loaded)
 */
add_task(async function panelSuppressionOnPanelLazyLoadTests() {
  // This needs to be done in a new window to ensure that
  // the previewPanel is being loaded for the first time
  let fgWindow = await BrowserTestUtils.openNewBrowserWindow();
  let fgTab = fgWindow.gBrowser.tabs[0];

  let fakePanel = createFakePanel(fgWindow);
  const popupShownEvent = BrowserTestUtils.waitForPopupEvent(
    fakePanel,
    "shown"
  );
  fakePanel.openPopup();
  await popupShownEvent;

  EventUtils.synthesizeMouseAtCenter(fgTab, { type: "mouseover" }, fgWindow);

  await BrowserTestUtils.waitForCondition(() => {
    // Sometimes the tests run slower than the test browser -- it's not always possible
    // to catch the panel in its opening state, so we have to check for both states.
    return (
      (fakePanel.getAttribute("animating") === "true" ||
        fakePanel.getAttribute("panelopen") === "true") &&
      fgWindow.gBrowser.tabContainer.previewPanel !== null
    );
  });
  const previewComponent = fgWindow.gBrowser.tabContainer.previewPanel;

  // We can't spy on the previewComponent and check for calls to `activate` like in other tests,
  // since we can't guarantee that the spy will be set up before the call is made.
  // Therefore the only reliable way to test that the popup isn't open is to reach in and check
  // that it is in a disabled state.
  Assert.equal(
    previewComponent.shouldActivate(),
    false,
    "Preview component is disabled"
  );

  // Reset state: close the popup and move the mouse off the tab
  const tabs = fgWindow.document.getElementById("tabbrowser-tabs");
  EventUtils.synthesizeMouse(
    tabs,
    0,
    tabs.outerHeight + 1,
    {
      type: "mouseout",
    },
    fgWindow
  );

  const popupHiddenEvent = BrowserTestUtils.waitForPopupEvent(
    fakePanel,
    "hidden"
  );
  fakePanel.hidePopup();
  await popupHiddenEvent;

  BrowserTestUtils.removeTab(fgTab);
  fakePanel.remove();
  await BrowserTestUtils.closeWindow(fgWindow);
  await resetState();
});

/**
 * Test that if the panel is opened and is subject to a UI delay, and another
 * panel opens before the delay expires, the panel does not open.
 */
add_task(
  async function panelSuppressionWhenOtherPanelsOpeningDuringDelayTests() {
    // This test verifies timing behavior that can't practically be tested in
    // chaos mode.
    if (parseInt(Services.env.get("MOZ_CHAOSMODE"), 16)) {
      return;
    }

    await SpecialPowers.pushPrefEnv({ set: [["ui.tooltip.delay_ms", 500]] });

    // Without this, the spies would be dependent on this task coming after the
    // above tasks. Set up the preview panel manually if necessary, to make the
    // task fully independent.
    let previewComponent = new TabHoverPanelSet(window);
    gBrowser.tabContainer.previewPanel = previewComponent;

    const tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "about:robots"
    );

    sinon.spy(previewComponent.panelOpener, "execute");
    sinon.spy(previewComponent.tabPanel.panelElement, "openPopup");

    // Start the timer...
    EventUtils.synthesizeMouseAtCenter(tab, { type: "mouseover" });

    await BrowserTestUtils.waitForCondition(
      () => previewComponent.panelOpener.execute.calledOnce,
      "panelOpener execute called"
    );
    Assert.ok(previewComponent.panelOpener.delayActive, "Timer is set");

    let fakePanel = createFakePanel();
    const popupShownEvent = BrowserTestUtils.waitForPopupEvent(
      fakePanel,
      "shown"
    );
    fakePanel.openPopup();
    await popupShownEvent;

    // Wait for timer to finish...
    await BrowserTestUtils.waitForCondition(() => {
      return previewComponent.panelOpener._timer == null;
    }, "panelOpener timer finished");
    await TestUtils.waitForTick();

    // As a popup was already open, the preview panel should not have opened.
    Assert.strictEqual(
      previewComponent.tabPanel.panelElement.state,
      "closed",
      "Panel is closed"
    );
    Assert.ok(
      previewComponent.tabPanel.panelElement.openPopup.notCalled,
      "openPopup was not invoked"
    );

    const popupHiddenEvent = BrowserTestUtils.waitForPopupEvent(
      fakePanel,
      "hidden"
    );
    fakePanel.hidePopup();
    await popupHiddenEvent;

    fakePanel.remove();
    BrowserTestUtils.removeTab(tab);
    sinon.restore();
    await SpecialPowers.popPrefEnv();
    await resetState();
  }
);

/**
 * In vertical tabs mode, previews should be displayed to the side
 * and not beneath the tab.
 */
// TODO bug1981197: Modify to support tab group preview
add_task(async function verticalTabsPositioningTests() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.revamp", true],
      ["sidebar.verticalTabs", true],
    ],
  });

  const previewPanel = document.getElementById(TAB_PREVIEW_PANEL_ID);
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  await openTabPreview(tab);

  let tabRect = tab.getBoundingClientRect();
  let panelRect = previewPanel.getBoundingClientRect();

  Assert.less(
    Math.abs(tabRect.top - panelRect.top),
    5,
    "Preview panel not displayed beneath tab"
  );

  await closeTabPreviews();
  BrowserTestUtils.removeTab(tab);
  await resetState();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that if tabs and tab groups are on the tab strip together,
 * hovering over one and then the other displays the correct preview.
 */
add_task(async function testTabAndTabGroupsWorkTogether() {
  const tabToLeft = await addTabTo(gBrowser, "about:robots");
  const tabInGroup = await addTabTo(gBrowser, "about:robots");
  const group = gBrowser.addTabGroup([tabInGroup]);
  group.collapsed = true;
  const tabToRight = await addTabTo(gBrowser, "about:robots");

  const tabPreviewElement = document.getElementById(TAB_PREVIEW_PANEL_ID);
  const groupPreviewElement = document.getElementById(
    TAB_GROUP_PREVIEW_PANEL_ID
  );

  let tabPreviewEvent = BrowserTestUtils.waitForPopupEvent(
    tabPreviewElement,
    "shown"
  );
  let groupPreviewEvent;
  EventUtils.synthesizeMouseAtCenter(tabToLeft, {
    type: "mouseover",
  });
  await tabPreviewEvent;
  Assert.equal(
    tabPreviewElement.state,
    "open",
    "Tab panel is open after hovering over left tab"
  );
  Assert.equal(
    groupPreviewElement.state,
    "closed",
    "Group panel is closed after hovering over left tab"
  );

  tabPreviewEvent = BrowserTestUtils.waitForPopupEvent(
    tabPreviewElement,
    "hidden"
  );
  groupPreviewEvent = BrowserTestUtils.waitForPopupEvent(
    groupPreviewElement,
    "shown"
  );
  EventUtils.synthesizeMouseAtCenter(group.labelElement, {
    type: "mouseover",
  });
  await tabPreviewEvent;
  await groupPreviewEvent;
  Assert.equal(
    tabPreviewElement.state,
    "closed",
    "Tab panel is closed after hovering over group label"
  );
  Assert.equal(
    groupPreviewElement.state,
    "open",
    "Group panel is open after hovering over group label"
  );

  tabPreviewEvent = BrowserTestUtils.waitForPopupEvent(
    tabPreviewElement,
    "shown"
  );
  groupPreviewEvent = BrowserTestUtils.waitForPopupEvent(
    groupPreviewElement,
    "hidden"
  );
  EventUtils.synthesizeMouseAtCenter(tabToRight, {
    type: "mouseover",
  });
  await tabPreviewEvent;
  await groupPreviewEvent;
  Assert.equal(
    tabPreviewElement.state,
    "open",
    "Tab panel is open after hovering over right tab"
  );
  Assert.equal(
    groupPreviewElement.state,
    "closed",
    "Group panel is closed after hovering over right tab"
  );

  tabPreviewEvent = BrowserTestUtils.waitForPopupEvent(
    tabPreviewElement,
    "hidden"
  );
  groupPreviewEvent = BrowserTestUtils.waitForPopupEvent(
    groupPreviewElement,
    "shown"
  );
  EventUtils.synthesizeMouseAtCenter(group.labelElement, {
    type: "mouseover",
  });
  await tabPreviewEvent;
  await groupPreviewEvent;
  Assert.equal(
    tabPreviewElement.state,
    "closed",
    "Tab panel is closed after hovering over group label"
  );
  Assert.equal(
    groupPreviewElement.state,
    "open",
    "Group panel is open after hovering over group label"
  );

  await resetState();
  BrowserTestUtils.removeTab(tabToLeft);
  BrowserTestUtils.removeTab(tabToRight);
  await removeTabGroup(group);
});
