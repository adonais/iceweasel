/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Test that cookie updates are only sent to storage panels whose window uses
// the same cookie jar as the cookie.

const TEST_URL = MAIN_URL_SECURED + "storage-updates.html";
const INITIAL_C1_VALUE = "1.2.3.4.5.6.7";

const IFRAME_URI =
  "https://example.org/document-builder.sjs?" +
  new URLSearchParams({ html: `<!DOCTYPE html><h1>Third party iframe</h1>` });

const embedderURI = origin =>
  `${origin}/document-builder.sjs?` +
  new URLSearchParams({
    html: `<!DOCTYPE html><h1>Embedder</h1><iframe src="${IFRAME_URI}"></iframe>`,
  });

add_task(async function () {
  const { storage: normalStorage } = await openTabAndSetupStorage(TEST_URL);
  const normalTab = gBrowser.selectedTab;

  const c1Id = getCookieId("c1", MAIN_HOST, "/browser");
  is(getCookieValue(normalStorage, c1Id), INITIAL_C1_VALUE, "c1 is displayed");

  info("Check the isolation with a private browsing window");
  const privateWindow = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  ok(PrivateBrowsingUtils.isWindowPrivate(privateWindow), "window is private");
  const privateTab = await addTab(TEST_URL, { window: privateWindow });
  const { storage: privateStorage } = await openStoragePanel({
    tab: privateTab,
  });
  const c1PrivateId = getCookieId("c1", MAIN_HOST, "/browser", {
    privateBrowsingId: 1,
  });
  is(
    getCookieValue(privateStorage, c1PrivateId),
    INITIAL_C1_VALUE,
    "c1 is displayed in the private window"
  );

  info("Change a cookie from the private window");
  let onEdit = privateStorage.UI.once("store-objects-edit");
  await addCookie(privateTab, "c1", "private-value", "/browser");
  await onEdit;

  is(
    getCookieValue(privateStorage, c1PrivateId),
    "private-value",
    "The private panel displays the new value"
  );
  is(
    getCookieValue(normalStorage, c1Id),
    INITIAL_C1_VALUE,
    "The normal panel was not updated by the private cookie"
  );

  info("Add a cookie from the normal window");
  onEdit = normalStorage.UI.once("store-objects-edit");
  await addCookie(normalTab, "c3", "normal-value", "/browser");
  await onEdit;

  const c3Id = getCookieId("c3", MAIN_HOST, "/browser");
  is(
    getCookieValue(normalStorage, c3Id),
    "normal-value",
    "The normal panel displays the new cookie"
  );
  ok(
    !privateStorage.UI.table.items.has(c3Id),
    "The private panel did not receive the normal cookie"
  );
  is(
    getCookieValue(normalStorage, c1Id),
    INITIAL_C1_VALUE,
    "The normal panel still displays its own value for c1"
  );

  await BrowserTestUtils.closeWindow(privateWindow);

  info("Check the isolation with a container tab");
  const containerTab = await addTab(TEST_URL, { userContextId: 1 });
  const { storage: containerStorage } = await openStoragePanel({
    tab: containerTab,
  });
  const c1ContainerId = getCookieId("c1", MAIN_HOST, "/browser", {
    userContextId: 1,
  });
  is(
    getCookieValue(containerStorage, c1ContainerId),
    INITIAL_C1_VALUE,
    "c1 is displayed in the container tab"
  );

  info("Change a cookie from the container tab");
  onEdit = containerStorage.UI.once("store-objects-edit");
  await addCookie(containerTab, "c1", "container-value", "/browser");
  await onEdit;

  is(
    getCookieValue(containerStorage, c1ContainerId),
    "container-value",
    "The container panel displays the new value"
  );
  is(
    getCookieValue(normalStorage, c1Id),
    INITIAL_C1_VALUE,
    "The normal panel was not updated by the container cookie"
  );

  info("Add a cookie from the normal window");
  onEdit = normalStorage.UI.once("store-objects-edit");
  await addCookie(normalTab, "c4", "normal-value", "/browser");
  await onEdit;

  const c4Id = getCookieId("c4", MAIN_HOST, "/browser");
  is(
    getCookieValue(normalStorage, c4Id),
    "normal-value",
    "The normal panel displays the new cookie"
  );
  ok(
    !containerStorage.UI.table.items.has(c4Id),
    "The container panel did not receive the normal cookie"
  );
  is(
    getCookieValue(containerStorage, c1ContainerId),
    "container-value",
    "The container panel still displays its own value for c1"
  );
});

add_task(async function () {
  info("Check the isolation between two partitions of the same third party");
  const { storage: firstStorage } = await openTabAndSetupStorage(
    embedderURI("https://example.com")
  );
  const firstTab = gBrowser.selectedTab;

  await openTab(embedderURI("https://example.net"));
  const { storage: secondStorage } = await openStoragePanel();

  info("Display the third party host in both panels");
  await selectHost(firstStorage, ["cookies", "https://example.org"]);
  await selectHost(secondStorage, ["cookies", "https://example.org"]);

  info("Set a partitioned cookie from the first site's iframe");
  const onEdit = firstStorage.UI.once("store-objects-edit");
  await addIframeCookie(firstTab, "c5", "first-site-value");
  await onEdit;

  const c5Id = getCookieId("c5", MAIN_DOMAIN, "/", {
    partitionKey: "(https,example.com)",
  });
  is(
    getCookieValue(firstStorage, c5Id),
    "first-site-value",
    "The first site's panel displays the cookie"
  );
  ok(
    !secondStorage.UI.table.items.has(c5Id),
    "The second site's panel did not receive the cookie of the other partition"
  );
});

function getCookieValue(storage, id) {
  return storage.UI.table.items.get(id)?.value;
}

async function selectHost(storage, ids) {
  await waitFor(() => storage.UI.tree.exists(ids));
  const updated = storage.UI.once("store-objects-updated");
  storage.UI.tree.selectedItem = ids;
  await updated;
}

async function addIframeCookie(tab, name, value) {
  const iframeContext = await SpecialPowers.spawn(
    tab.linkedBrowser,
    [],
    () => content.document.querySelector("iframe").browsingContext
  );
  await SpecialPowers.spawn(iframeContext, [[name, value]], ([nam, valu]) => {
    content.document.cookie = `${nam}=${valu}; Partitioned; Secure; SameSite=None; Path=/`;
  });
}

function addCookie(tab, name, value, path) {
  return SpecialPowers.spawn(
    tab.linkedBrowser,
    [[name, value, path]],
    ([nam, valu, pat]) => {
      content.wrappedJSObject.addCookie(nam, valu, pat);
    }
  );
}
