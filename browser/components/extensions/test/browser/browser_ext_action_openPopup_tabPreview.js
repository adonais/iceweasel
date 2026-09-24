/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tab hover previews are tooltip-like panels tied to the pointer being over the
// tab strip. Unlike the other panels covered by browser_ext_action_openPopup.js
// they do not block action.openPopup(), and openPopup() leaves them alone.

const { TabGroupTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TabGroupTestUtils.sys.mjs"
);

const TAB_PREVIEW_PANEL_ID = "tab-preview-panel";
const TAB_GROUP_PREVIEW_PANEL_ID = "tabgroup-preview-panel";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.tabs.groups.hoverPreview.enabled", true],
      ["browser.tabs.hoverPreview.enabled", true],
      ["browser.tabs.hoverPreview.showThumbnails", false],
      ["ui.tooltip.delay_ms", 0],
    ],
  });

  EventUtils.disableNonTestMouseEvents(true);
  registerCleanupFunction(() => {
    EventUtils.disableNonTestMouseEvents(false);
  });
});

async function openPreview(panelId, anchor) {
  const panel = document.getElementById(panelId);
  const shown = BrowserTestUtils.waitForPopupEvent(panel, "shown");
  EventUtils.synthesizeMouseAtCenter(anchor, { type: "mouseover" }, window);
  await shown;
  return panel;
}

async function closePreview(panel) {
  const hidden = BrowserTestUtils.waitForPopupEvent(panel, "hidden");
  const tabs = document.getElementById("tabbrowser-tabs");
  EventUtils.synthesizeMouse(
    tabs,
    0,
    tabs.getBoundingClientRect().height + 10,
    { type: "mouseout" },
    window
  );
  await hidden;
}

async function assertOpenPopupWorksWithPreview(panelId, anchor) {
  const previewPanel = await openPreview(panelId, anchor);
  Assert.equal(previewPanel.state, "open", `${panelId} is open`);

  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      manifest_version: 3,
      action: { default_popup: "popup.html" },
    },
    files: {
      "popup.html": `<script src="popup.js"></script>`,
      "popup.js": `browser.test.sendMessage("popup_opened");`,
    },
    async background() {
      await browser.action.openPopup();
      browser.test.sendMessage("openPopup_resolved");
    },
  });
  await extension.startup();
  await Promise.all([
    extension.awaitMessage("openPopup_resolved"),
    extension.awaitMessage("popup_opened"),
  ]);

  // openPopup() ignores the preview rather than dismissing it: the preview is
  // still owned by the pointer, and moving the pointer away still hides it.
  Assert.equal(previewPanel.state, "open", `${panelId} is still open`);

  await closeBrowserAction(extension);
  await extension.unload();

  await closePreview(previewPanel);
}

add_task(async function test_tab_preview_does_not_block_openPopup() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  await assertOpenPopupWorksWithPreview(TAB_PREVIEW_PANEL_ID, gBrowser.tabs[0]);

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_tab_group_preview_does_not_block_openPopup() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  const group = gBrowser.addTabGroup([tab]);
  group.collapsed = true;

  await assertOpenPopupWorksWithPreview(
    TAB_GROUP_PREVIEW_PANEL_ID,
    group.labelElement
  );

  await TabGroupTestUtils.removeTabGroup(group);
});
