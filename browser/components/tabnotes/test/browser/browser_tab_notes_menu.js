/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { TabNotes } = ChromeUtils.importESModule(
  "moz-src:///browser/components/tabnotes/TabNotes.sys.mjs"
);

registerCleanupFunction(() => {
  TabNotes.reset();
});

/**
 *  Tab note menu tests
 */

/**
 * @param {Node} triggerNode
 * @param {string} contextMenuId
 * @returns {Promise<XULMenuElement|XULPopupElement>}
 */
async function getContextMenu(triggerNode, contextMenuId) {
  let win = triggerNode.ownerGlobal;
  triggerNode.scrollIntoView({ behavior: "instant" });
  const contextMenu = win.document.getElementById(contextMenuId);
  const contextMenuShown = BrowserTestUtils.waitForPopupEvent(
    contextMenu,
    "shown"
  );

  EventUtils.synthesizeMouseAtCenter(
    triggerNode,
    { type: "contextmenu", button: 2 },
    win
  );
  await contextMenuShown;
  return contextMenu;
}

/**
 * @param {XULMenuElement|XULPopupElement} contextMenu
 * @returns {Promise<void>}
 */
async function closeContextMenu(contextMenu) {
  let menuHidden = BrowserTestUtils.waitForPopupEvent(contextMenu, "hidden");
  contextMenu.hidePopup();
  await menuHidden;
}

async function openTabNoteMenu(tab) {
  let tabContextMenu = await getContextMenu(tab, "tabContextMenu");
  let tabNotePanel = document.getElementById("tabNotePanel");
  let panelShown = BrowserTestUtils.waitForPopupEvent(tabNotePanel, "shown");
  tabContextMenu.activateItem(document.getElementById("context_addNote"));
  await panelShown;
  return tabNotePanel;
}

async function closeTabNoteMenu() {
  let tabNotePanel = document.getElementById("tabNotePanel");
  let menuHidden = BrowserTestUtils.waitForPopupEvent(tabNotePanel, "hidden");
  tabNotePanel.hidePopup();
  return menuHidden;
}

/**
 * Adds a tab, waits for it to load, and waits for the canonical URL to be
 * identified from the loaded contents of the tab. This ensures that the tab
 * meets the requirements to have a tab note.
 *
 * @param {string} [url="https://www.example.com"]
 * @returns {Promise<{tab: MozTabbrowserTab, canonicalUrl: string}>}
 */
async function addTabWithCanonicalUrl(url = "https://www.example.com") {
  const { promise, resolve } = Promise.withResolvers();
  BrowserTestUtils.addTab(
    gBrowser,
    url,
    {
      skipAnimation: true,
    },
    tab => {
      BrowserTestUtils.waitForEvent(
        window,
        "CanonicalURL:Identified",
        false,
        e => e.target == tab.linkedBrowser
      ).then(e => {
        resolve({ tab, canonicalUrl: e.detail.canonicalUrl });
      });
    }
  );
  return promise;
}

add_task(async function test_openTabNotePanelFromContextMenu() {
  // open context menu with tab notes disabled
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", false]],
  });
  let tab = BrowserTestUtils.addTab(gBrowser, "https://www.example.com");
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  let addNoteElement = document.getElementById("context_addNote");
  let tabContextMenu = await getContextMenu(tab, "tabContextMenu");
  Assert.ok(
    addNoteElement.hidden,
    "'Add Note' is hidden from context menu when pref disabled"
  );
  await closeContextMenu(tabContextMenu);
  await SpecialPowers.popPrefEnv();

  // open context menu with tab notes enabled
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", true]],
  });
  tabContextMenu = await getContextMenu(tab, "tabContextMenu");
  Assert.ok(
    !addNoteElement.hidden,
    "'Add Note' is visible in context menu when pref enabled"
  );
  let tabNotePanel = document.getElementById("tabNotePanel");

  // open panel from context menu
  let panelShown = BrowserTestUtils.waitForPopupEvent(tabNotePanel, "shown");
  Assert.equal(tabNotePanel.state, "closed", "Tab note panel starts hidden");
  tabContextMenu.activateItem(addNoteElement);
  await panelShown;
  Assert.equal(
    tabNotePanel.state,
    "open",
    "Tab note panel appears after clicking context menu item"
  );
  await closeTabNoteMenu();
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_dismissTabNotePanel() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", true]],
  });
  // Dismiss panel by pressing Esc
  let tab = BrowserTestUtils.addTab(gBrowser, "https://www.example.com");
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  let tabNoteMenu = await openTabNoteMenu(tab);
  Assert.equal(tabNoteMenu.state, "open", "Tab note menu is open");
  EventUtils.synthesizeKey("KEY_Escape");
  await BrowserTestUtils.waitForPopupEvent(tabNoteMenu, "hidden");
  Assert.equal(
    tabNoteMenu.state,
    "closed",
    "Tab note menu closes after pressing Esc"
  );

  // Dismiss panel by clicking Cancel
  tabNoteMenu = await openTabNoteMenu(tab);
  Assert.equal(tabNoteMenu.state, "open", "Tab note menu is open");
  let menuHidden = BrowserTestUtils.waitForPopupEvent(tabNoteMenu, "hidden");
  let cancelButton = document.getElementById("tab-note-editor-button-cancel");
  cancelButton.click();
  await menuHidden;
  Assert.equal(
    tabNoteMenu.state,
    "closed",
    "Tab note menu closes after clicking cancel button"
  );
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_saveTabNote() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", true]],
  });
  let { tab, canonicalUrl } = await addTabWithCanonicalUrl();
  let tabNoteMenu = await openTabNoteMenu(tab);
  tabNoteMenu.querySelector("textarea").value = "Lorem ipsum dolor";
  let menuHidden = BrowserTestUtils.waitForPopupEvent(tabNoteMenu, "hidden");
  tabNoteMenu.querySelector("#tab-note-editor-button-save").click();
  await menuHidden;

  Assert.equal(TabNotes.get(canonicalUrl), "Lorem ipsum dolor");

  TabNotes.delete(canonicalUrl);
  BrowserTestUtils.removeTab(tab);

  await SpecialPowers.popPrefEnv();
});
