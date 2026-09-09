/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

const TEST_HOST = "example.com";

// eslint-disable-next-line sdl/no-insecure-url
const TEST_URL = "http://" + TEST_HOST;

const TEST_URL_FULL =
  TEST_URL + "/browser/browser/components/contextualidentity/test/browser/";

async function openTabMenuFor(tab) {
  let tabMenu = tab.ownerDocument.getElementById("tabContextMenu");

  let tabMenuShown = BrowserTestUtils.waitForEvent(tabMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    tab,
    { type: "contextmenu" },
    tab.documentGlobal
  );
  await tabMenuShown;

  return tabMenu;
}

async function openReopenMenuForTab(tab) {
  await openTabMenuFor(tab);

  let reopenItem = tab.ownerDocument.getElementById(
    "context_reopenInContainer"
  );
  ok(!reopenItem.hidden, "Reopen in Container item should be shown");

  let reopenMenu = reopenItem.getElementsByTagName("menupopup")[0];
  let reopenMenuShown = BrowserTestUtils.waitForEvent(reopenMenu, "popupshown");
  reopenItem.openMenu(true);
  await reopenMenuShown;

  return reopenMenu;
}

function openTabInContainer(gBrowser, reopenMenu, id) {
  let tabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    TEST_URL_FULL,
    true
  );
  let menuitem = reopenMenu.querySelector(
    `menuitem[data-usercontextid="${id}"]`
  );
  reopenMenu.activateItem(menuitem);
  return tabPromise;
}

add_task(async function testManageContainersOpened() {
  Services.fog.testResetFOG();

  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TEST_URL_FULL
  );

  const reopenMenu = await openReopenMenuForTab(tab);
  const manageItem = reopenMenu.querySelector(
    'menuitem[data-l10n-id="user-context-manage-containers"]'
  );
  ok(manageItem, "The Manage Containers item should be shown");

  const prefsTabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    url => url.startsWith("about:preferences"),
    true
  );
  reopenMenu.activateItem(manageItem);
  const prefsTab = await prefsTabPromise;

  Assert.ok(
    prefsTab.linkedBrowser.currentURI.spec.includes(
      "entrypoint=tab_context_menu"
    ),
    "The entry point is passed to about:preferences"
  );

  let events;
  await TestUtils.waitForCondition(() => {
    events = Glean.containers.manageContainersOpened.testGetValue();
    return !!events;
  }, "waiting for the manage_containers_opened event");

  Assert.equal(events.length, 1, "One manage_containers_opened event");
  Assert.equal(
    events[0].extra.source,
    "tab_context_menu",
    "manage_containers_opened reports the tab context menu source"
  );

  BrowserTestUtils.removeTab(prefsTab);
  BrowserTestUtils.removeTab(tab);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testTelemetry() {
  Services.telemetry.clearEvents();
  Services.fog.testResetFOG();

  const userContextId = 1;

  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });

  const tab = BrowserTestUtils.addTab(gBrowser, TEST_URL_FULL, {
    userContextId,
  });
  await BrowserTestUtils.browserLoaded(gBrowser.getBrowserForTab(tab));

  let tabOpenedEvent = Glean.containers.containerTabOpened.testGetValue();
  Assert.ok(Array.isArray(tabOpenedEvent), "container_tab_opened must exist");
  Assert.equal(tabOpenedEvent.length, 1);
  Assert.equal(tabOpenedEvent[0].extra.container_id, 1);
  Assert.equal(
    tabOpenedEvent[0].extra.source,
    "unknown",
    "A tab opened programmatically has no UI entry point"
  );

  const reopenMenu = await openReopenMenuForTab(tab);
  const tab2 = await openTabInContainer(gBrowser, reopenMenu, "2");

  tabOpenedEvent = Glean.containers.containerTabOpened.testGetValue();
  Assert.ok(Array.isArray(tabOpenedEvent), "container_tab_opened must exist");
  Assert.equal(tabOpenedEvent.length, 2);
  Assert.equal(tabOpenedEvent[0].extra.container_id, 1);
  Assert.equal(tabOpenedEvent[1].extra.container_id, 2);
  Assert.equal(
    tabOpenedEvent[1].extra.source,
    "tab_context_menu",
    "container_tab_opened reports the tab context menu source"
  );

  const tabAssignedEvent = Glean.containers.tabAssignedContainer.testGetValue();
  Assert.ok(Array.isArray(tabAssignedEvent), "tab_assigned_container exists");
  Assert.equal(tabAssignedEvent.length, 1);
  Assert.equal(tabAssignedEvent[0].extra.from_container_id, 1);
  Assert.equal(tabAssignedEvent[0].extra.to_container_id, 2);

  BrowserTestUtils.removeTab(tab);

  let tabClosedEvent = Glean.containers.containerTabClosed.testGetValue();
  Assert.ok(Array.isArray(tabClosedEvent), "container_tab_closed must exist");
  Assert.equal(tabClosedEvent.length, 1);
  Assert.equal(tabClosedEvent[0].extra.container_id, 1);

  BrowserTestUtils.removeTab(tab2);

  tabClosedEvent = Glean.containers.containerTabClosed.testGetValue();
  Assert.ok(Array.isArray(tabClosedEvent), "container_tab_closed must exist");
  Assert.equal(tabClosedEvent.length, 2);
  Assert.equal(tabClosedEvent[0].extra.container_id, 1);
  Assert.equal(tabClosedEvent[1].extra.container_id, 2);
});

add_task(async function testAddContainerClicked() {
  Services.fog.testResetFOG();

  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });

  const popup = document.getElementById("new-tab-button-popup");
  const popupShown = BrowserTestUtils.waitForEvent(popup, "popupshown");
  EventUtils.synthesizeMouseAtCenter(gBrowser.tabContainer.newTabButton, {
    type: "contextmenu",
  });
  await popupShown;

  // This popup is built without access keys, so its items carry a plain label:
  // the Add and Manage items are the only ones without a container id.
  const [item] = popup.querySelectorAll("menuitem:not([data-usercontextid])");
  ok(item, "The Add Container item should be shown");

  const creationPanel = document.getElementById("containerCreation-panel");
  const panelShown = BrowserTestUtils.waitForEvent(creationPanel, "popupshown");
  popup.activateItem(item);
  await panelShown;

  const clickedEvent = Glean.containers.addContainerClicked.testGetValue();
  Assert.ok(Array.isArray(clickedEvent), "add_container_clicked must exist");
  Assert.equal(clickedEvent.length, 1);
  Assert.equal(
    clickedEvent[0].extra.source,
    "new_tab_button",
    "add_container_clicked reports the new tab button source"
  );
  Assert.equal(
    Glean.containers.containerCreated.testGetValue(),
    undefined,
    "The dialog was opened, no container was created"
  );

  const panelHidden = BrowserTestUtils.waitForEvent(
    creationPanel,
    "popuphidden"
  );
  creationPanel.hidePopup();
  await panelHidden;

  await SpecialPowers.popPrefEnv();
});

add_task(async function testAddContainerFromAllTabsMenu() {
  Services.fog.testResetFOG();

  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });

  gTabsPanel.init();
  const allTabsView = document.getElementById("allTabsMenu-allTabsView");
  let viewShown = BrowserTestUtils.waitForEvent(allTabsView, "ViewShown");
  document.getElementById("alltabs-button").click();
  await viewShown;

  const containerView = document.getElementById(
    "allTabsMenu-containerTabsView"
  );
  viewShown = BrowserTestUtils.waitForEvent(containerView, "ViewShown");
  document.getElementById("allTabsMenu-containerTabsButton").click();
  await viewShown;

  Assert.equal(
    containerView.querySelector("toolbarbutton[data-usercontextid='1']").dataset
      .containerEntrypoint,
    "all_tabs_menu",
    "The container items carry the all tabs menu entry point"
  );

  const creationPanel = document.getElementById("containerCreation-panel");
  const panelShown = BrowserTestUtils.waitForEvent(creationPanel, "popupshown");
  containerView
    .querySelector('[data-l10n-id="user-context-add-container"]')
    .click();
  await panelShown;

  const clickedEvent = Glean.containers.addContainerClicked.testGetValue();
  Assert.ok(Array.isArray(clickedEvent), "add_container_clicked must exist");
  Assert.equal(clickedEvent.length, 1);
  Assert.equal(
    clickedEvent[0].extra.source,
    "all_tabs_menu",
    "add_container_clicked reports the all tabs menu source"
  );

  const panelHidden = BrowserTestUtils.waitForEvent(
    creationPanel,
    "popuphidden"
  );
  creationPanel.hidePopup();
  await panelHidden;

  await SpecialPowers.popPrefEnv();
});

add_task(async function testManageContainersFromIndicatorMenu() {
  Services.fog.testResetFOG();

  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });

  const tab = BrowserTestUtils.addTab(gBrowser, TEST_URL_FULL, {
    userContextId: 1,
  });
  await BrowserTestUtils.browserLoaded(gBrowser.getBrowserForTab(tab));
  gBrowser.selectedTab = tab;

  const indicator = document.getElementById("userContext-icons");
  ok(BrowserTestUtils.isVisible(indicator), "The container indicator is shown");

  const menu = document.getElementById("userContext-indicator-menu");
  const menuShown = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(indicator, {});
  await menuShown;

  const prefsTabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    url => url.startsWith("about:preferences"),
    true
  );
  menu.activateItem(
    menu.querySelector(
      'menuitem[data-l10n-id="user-context-manage-containers"]'
    )
  );
  const prefsTab = await prefsTabPromise;

  Assert.equal(
    prefsTab.linkedBrowser.currentURI.spec,
    "about:preferences?entrypoint=container_indicator_menu#containers",
    "The command handler passed the entry point of the menu item"
  );

  const openedEvent = Glean.containers.manageContainersOpened.testGetValue();
  Assert.ok(Array.isArray(openedEvent), "manage_containers_opened must exist");
  Assert.equal(openedEvent.length, 1);
  Assert.equal(
    openedEvent[0].extra.source,
    "container_indicator_menu",
    "manage_containers_opened reports the container indicator source"
  );

  BrowserTestUtils.removeTab(prefsTab);
  BrowserTestUtils.removeTab(tab);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testFileMenuItemsCarryTheEntrypoint() {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });

  // The menu bar is native on macOS, so the popup is populated rather than
  // opened: the entry point is the attribute the command handler reads.
  const popup = document.getElementById("menu_newUserContextPopup");
  popup.dispatchEvent(new CustomEvent("popupshowing", { bubbles: true }));

  const item = popup.querySelector('menuitem[data-usercontextid="1"]');
  ok(item, "The container item should be built");
  Assert.equal(
    item.getAttribute("command"),
    "Browser:NewUserContextTab",
    "The item opens a container tab through the command"
  );
  Assert.equal(
    item.dataset.containerEntrypoint,
    "file_menu",
    "The item carries the File menu entry point"
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function testTabOpenedFromContentContextMenu() {
  Services.fog.testResetFOG();

  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TEST_URL_FULL + "blank.html"
  );

  await SpecialPowers.spawn(tab.linkedBrowser, [TEST_URL_FULL], url => {
    let link = content.document.createElement("a");
    link.id = "testlink";
    link.href = url;
    link.textContent = "link";
    content.document.body.append(link);
  });

  const contextMenu = document.getElementById("contentAreaContextMenu");
  const menuShown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#testlink",
    { type: "contextmenu", button: 2 },
    tab.linkedBrowser
  );
  await menuShown;

  const containerMenu = document.getElementById(
    "context-openlinkinusercontext-menu"
  );
  const submenuShown = BrowserTestUtils.waitForEvent(
    containerMenu.menupopup,
    "popupshown"
  );
  containerMenu.openMenu(true);
  await submenuShown;

  const newTab = BrowserTestUtils.waitForNewTab(gBrowser, TEST_URL_FULL, true);
  containerMenu.menupopup.activateItem(
    containerMenu.menupopup.querySelector('menuitem[data-usercontextid="1"]')
  );
  const containerTab = await newTab;

  const tabOpenedEvent = Glean.containers.containerTabOpened.testGetValue();
  Assert.ok(Array.isArray(tabOpenedEvent), "container_tab_opened must exist");
  Assert.equal(tabOpenedEvent.length, 1);
  Assert.equal(
    tabOpenedEvent[0].extra.source,
    "content_context_menu",
    "container_tab_opened reports the content context menu source"
  );

  BrowserTestUtils.removeTab(containerTab);
  BrowserTestUtils.removeTab(tab);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testTabOpenedFromNewTabButton() {
  Services.fog.testResetFOG();

  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });

  const popup = document.getElementById("new-tab-button-popup");
  const popupShown = BrowserTestUtils.waitForEvent(popup, "popupshown");
  EventUtils.synthesizeMouseAtCenter(gBrowser.tabContainer.newTabButton, {
    type: "contextmenu",
  });
  await popupShown;

  const item = popup.querySelector('menuitem[data-usercontextid="1"]');
  ok(item, "The container item should be shown");

  const tabOpened = BrowserTestUtils.waitForEvent(
    gBrowser.tabContainer,
    "TabOpen"
  );
  popup.activateItem(item);
  const tab = (await tabOpened).target;

  const tabOpenedEvent = Glean.containers.containerTabOpened.testGetValue();
  Assert.ok(Array.isArray(tabOpenedEvent), "container_tab_opened must exist");
  Assert.equal(tabOpenedEvent.length, 1);
  Assert.equal(tabOpenedEvent[0].extra.container_id, 1);
  Assert.equal(
    tabOpenedEvent[0].extra.source,
    "new_tab_button",
    "container_tab_opened reports the new tab button source"
  );

  BrowserTestUtils.removeTab(tab);

  await SpecialPowers.popPrefEnv();
});
