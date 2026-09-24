/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.openTabsPanel.enabled", true],
      ["sidebar.openTabsPanel.hoverPreview.enabled", true],
      ["sidebar.main.tools", "opentabs,history,bookmarks"],
      ["ui.tooltip.delay_ms", 0],
    ],
  });
  await SidebarTestUtils.ensureLauncherVisible(window);
});

registerCleanupFunction(() => {
  cleanUpExtraTabs();
});

function getPreview() {
  return document.querySelector("sidebar-opentabs-preview");
}

async function getLauncherButton() {
  const { sidebarMain } = SidebarController;
  const selector = 'moz-button[view="viewOpenTabsSidebar"]';
  await BrowserTestUtils.waitForMutationCondition(
    sidebarMain.shadowRoot,
    { childList: true, subtree: true },
    () => sidebarMain.shadowRoot.querySelector(selector)
  );
  const button = sidebarMain.shadowRoot.querySelector(selector);
  // The button is in the shadow DOM before it has rendered its own contents,
  // and so before it has any height. Necessary but not sufficient: the
  // launcher keeps reflowing around the button afterwards, which is what the
  // retry in hoverLauncherButton() is for.
  await button.updateComplete;
  return button;
}

function moveMouseTo(target) {
  window.windowUtils.disableNonTestMouseEvents(true);
  EventUtils.synthesizeMouseAtCenter(target, { type: "mousemove" });
  window.windowUtils.disableNonTestMouseEvents(false);
}

async function hoverLauncherButton() {
  const button = await getLauncherButton();
  if (button.matches(":hover")) {
    // The preview opens from a mouseover, and a move within the element the
    // pointer is already over produces none: without this the loop below is
    // satisfied on its first poll without anything having been hovered.
    moveMouseTo(gBrowser.selectedBrowser);
  }
  await TestUtils.waitForCondition(() => {
    moveMouseTo(button);
    return button.matches(":hover");
  }, "waiting for the pointer to land on the launcher button");
}

async function showPreview() {
  const preview = getPreview();
  const shown = BrowserTestUtils.waitForEvent(preview.panel, "popupshown");
  await hoverLauncherButton();
  await shown;
  await preview.updateComplete;
  return preview;
}

async function hidePreview() {
  const preview = getPreview();
  if (preview.panel.state == "closed") {
    return;
  }

  const hidden = BrowserTestUtils.waitForEvent(preview.panel, "popuphidden");
  preview.hide();
  await hidden;
}

function rowTitles(preview) {
  return [...preview.rows].map(
    row => row.querySelector(".preview-row-title").textContent
  );
}

add_task(async function test_hover_shows_recent_tabs() {
  const tabs = [];
  for (let i = 1; i <= 6; i++) {
    tabs.push(
      await BrowserTestUtils.openNewForegroundTab(
        gBrowser,
        `data:text/html,<title>Preview ${i}</title>`
      )
    );
  }

  const preview = await showPreview();
  Assert.equal(preview.rows.length, 5, "The preview shows at most five tabs.");

  const titles = rowTitles(preview);
  Assert.equal(
    titles[0],
    "Preview 6",
    "The most recently active tab is listed first."
  );
  Assert.ok(
    !titles.includes("Preview 1"),
    "The least recently active tab is left out."
  );

  await hidePreview();
  tabs.forEach(tab => BrowserTestUtils.removeTab(tab));
});

add_task(async function test_audio_tabs_are_listed_first() {
  const quietTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "data:text/html,<title>Quiet</title>"
  );
  const audioTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "data:text/html,<title>Audible</title>"
  );
  // Open one more afterwards so the audio tab is not already the most recent.
  const newestTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "data:text/html,<title>Newest</title>"
  );
  audioTab.setAttribute("soundplaying", "true");

  const preview = await showPreview();
  Assert.equal(
    rowTitles(preview)[0],
    "Audible",
    "A tab playing audio is listed above more recently active tabs."
  );
  Assert.ok(
    preview.rows[0].querySelector(".audio-button"),
    "The tab playing audio shows the mute button."
  );

  await hidePreview();
  audioTab.removeAttribute("soundplaying");
  for (const tab of [quietTab, audioTab, newestTab]) {
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_close_button_closes_tab() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "data:text/html,<title>Closable</title>"
  );

  const preview = await showPreview();
  const row = [...preview.rows].find(
    r => r.querySelector(".preview-row-title").textContent == "Closable"
  );
  Assert.ok(row, "The tab appears in the preview.");

  // The close button is only visible while the row is hovered, and clicking it
  // while it is not gives it no accessible.
  moveMouseTo(row);
  const closeButton = row.querySelector(".close-button");
  await TestUtils.waitForCondition(
    () => closeButton.checkVisibility({ visibilityProperty: true }),
    "waiting for the close button of the hovered row to become visible"
  );
  closeButton.click();
  await BrowserTestUtils.waitForMutationCondition(
    gBrowser.tabContainer,
    { childList: true, subtree: true },
    () => !gBrowser.tabs.includes(tab)
  );
  Assert.ok(!gBrowser.tabs.includes(tab), "The close button closed the tab.");

  await hidePreview();
});

add_task(async function test_show_all_opens_the_panel() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "data:text/html,<title>ShowAll</title>"
  );

  const preview = await showPreview();
  const hidden = BrowserTestUtils.waitForEvent(preview.panel, "popuphidden");
  preview.showAllButton.click();
  await hidden;
  await SidebarController.waitUntilStable();

  Assert.equal(
    SidebarController.currentID,
    "viewOpenTabsSidebar",
    "Show all opens the Open Tabs panel."
  );

  await hidePreview();
  SidebarController.hide();
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_preview_respects_pref() {
  await SpecialPowers.pushPrefEnv({
    set: [["sidebar.openTabsPanel.hoverPreview.enabled", false]],
  });

  const preview = getPreview();
  await hoverLauncherButton();
  await waitForRepaint();

  Assert.equal(
    preview.panel.state,
    "closed",
    "The preview does not open while the hover preview pref is off."
  );

  await hidePreview();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_audio_button_mutes_tab() {
  const audioTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "data:text/html,<title>Audible</title>"
  );
  audioTab.setAttribute("soundplaying", "true");

  const preview = await showPreview();
  const row = [...preview.rows].find(
    r => r.querySelector(".preview-row-title").textContent == "Audible"
  );
  const audioButton = row.querySelector(".audio-button");
  Assert.ok(audioButton, "A tab with audio shows the mute button.");

  audioButton.click();
  await BrowserTestUtils.waitForMutationCondition(
    audioTab,
    { attributes: true, attributeFilter: ["muted"] },
    () => audioTab.hasAttribute("muted")
  );
  Assert.ok(audioTab.hasAttribute("muted"), "The button muted the tab.");

  await hidePreview();
  audioTab.removeAttribute("soundplaying");
  BrowserTestUtils.removeTab(audioTab);
});
