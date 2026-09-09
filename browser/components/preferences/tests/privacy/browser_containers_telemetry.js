/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const CONTAINERS_URL =
  "chrome://browser/content/preferences/dialogs/containers.xhtml";

async function waitForOpenedEvents() {
  let events;
  await TestUtils.waitForCondition(() => {
    events = Glean.containers.manageContainersOpened.testGetValue();
    return !!events;
  }, "waiting for the manage_containers_opened event");
  return events;
}

add_task(async function test_manage_containers_opened_with_entrypoint() {
  Services.fog.testResetFOG();

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences?entrypoint=file_menu#containers"
  );

  let events = await waitForOpenedEvents();
  Assert.equal(events.length, 1, "One manage_containers_opened event");
  Assert.equal(
    events[0].extra.source,
    "file_menu",
    "manage_containers_opened reports the entry point of the URL"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_manage_containers_opened_once_per_request() {
  Services.fog.testResetFOG();

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences#containers"
  );
  await waitForOpenedEvents();

  // With the section already showing, openPreferences reloads the tab and asks
  // for the category again: that is a single request.
  let loaded = BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, url =>
    url.includes("entrypoint=tab_context_menu")
  );
  await openPreferences("paneContainers", {
    urlParams: { entrypoint: "tab_context_menu" },
  });
  await loaded;

  // Both the reload and the gotoPref call openPreferences makes have happened,
  // so the count is settled.
  let events;
  await TestUtils.waitForCondition(() => {
    events = Glean.containers.manageContainersOpened.testGetValue();
    return events.length >= 2;
  }, "waiting for the second manage_containers_opened event");

  Assert.equal(events.length, 2, "The second request recorded a single event");
  Assert.equal(
    events[1].extra.source,
    "tab_context_menu",
    "manage_containers_opened reports the second entry point"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_manage_containers_opened_from_settings() {
  Services.fog.testResetFOG();

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences?entrypoint=syncbutton"
  );

  Assert.equal(
    Glean.containers.manageContainersOpened.testGetValue(),
    undefined,
    "No event for a section other than containers"
  );

  let win = tab.linkedBrowser.contentWindow;
  let shown = BrowserTestUtils.waitForEvent(
    win.document,
    "paneshown",
    false,
    event => event.detail.category == "paneContainers"
  );
  win.gotoPref("paneContainers");
  await shown;

  let events = await waitForOpenedEvents();
  Assert.equal(events.length, 1, "One manage_containers_opened event");
  Assert.equal(
    events[0].extra.source,
    "preferences",
    "A navigation within the settings is reported as such, and does not inherit the entry point of another section"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_add_container_clicked_from_preferences() {
  Services.fog.testResetFOG();

  await openPreferencesViaOpenPreferencesAPI("containers", { leaveOpen: true });
  registerCleanupFunction(() =>
    BrowserTestUtils.removeTab(gBrowser.selectedTab)
  );

  let openedEvents = Glean.containers.manageContainersOpened.testGetValue();
  Assert.equal(openedEvents.length, 1, "One manage_containers_opened event");
  Assert.equal(
    openedEvents[0].extra.source,
    "unknown",
    "manage_containers_opened has no entry point when opened directly"
  );

  let doc = gBrowser.selectedBrowser.contentDocument;
  let dialogPromise = promiseLoadSubDialog(CONTAINERS_URL);
  doc.getElementById("containers-add-button").click();
  await dialogPromise;

  let clickedEvents = Glean.containers.addContainerClicked.testGetValue();
  Assert.equal(clickedEvents.length, 1, "One add_container_clicked event");
  Assert.equal(
    clickedEvents[0].extra.source,
    "preferences",
    "add_container_clicked reports the preferences source"
  );
});
