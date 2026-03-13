/* Any copyright is dedicated to the Public Domain.
  http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const BASE = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);
const TEST_URL_1 = BASE + "browser_contextmenu_shareurl.html";
const TEST_URL_2 = "https://example.org/";

/**
 * Test the "Share" item in the tab contextmenu on Linux.
 */
add_task(async function test_contextmenu_share_linux() {
  await BrowserTestUtils.withNewTab(TEST_URL_1, async () => {
    await openTabContextMenu(gBrowser.selectedTab);
    let contextMenu = document.getElementById("tabContextMenu");

    let contextMenuClosedPromise = BrowserTestUtils.waitForPopupEvent(
      contextMenu,
      "hidden"
    );
    let itemCreated = contextMenu.querySelector(".share-tab-url-item");
    ok(itemCreated, "Got Share item on Linux");
    await SimpleTest.promiseClipboardChange(TEST_URL_1, () =>
      contextMenu.activateItem(itemCreated)
    );
    ok(true, "Copied to clipboard.");

    await contextMenuClosedPromise;
  });
});

/**
 * Test that "Copy link" on Linux copies all URLs when multiple tabs are
 * selected.
 */
add_task(async function test_contextmenu_share_multiselect_linux() {
  let tab1 = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL_1);
  let tab2 = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL_2);

  await triggerClickOn(tab1, { ctrlKey: true });
  ok(tab1.multiselected, "tab1 is multiselected");
  ok(tab2.multiselected, "tab2 is multiselected");

  let contextMenu = await openTabContextMenu(tab2);
  let shareItem = contextMenu.querySelector(".share-tab-url-item");
  ok(shareItem, "share item exists for multiselected tabs");
  ok(!shareItem.hidden, "share item is visible");

  let contextMenuClosed = BrowserTestUtils.waitForPopupEvent(
    contextMenu,
    "hidden"
  );
  await SimpleTest.promiseClipboardChange(TEST_URL_1 + "\n" + TEST_URL_2, () =>
    contextMenu.activateItem(shareItem)
  );
  await contextMenuClosed;

  info("Verify HTML clipboard contains linked anchors for both tabs");
  let htmlContent = getHTMLClipboard();
  let htmlDoc = new DOMParser().parseFromString(htmlContent, "text/html");
  let anchors = Array.from(htmlDoc.querySelectorAll("a"));
  is(anchors.length, 2, "HTML clipboard has 2 anchor elements");
  is(
    anchors[0].getAttribute("href"),
    TEST_URL_1,
    "First anchor href matches URL 1"
  );
  ok(anchors[0].textContent, "First anchor has non-empty title");
  is(
    anchors[1].getAttribute("href"),
    TEST_URL_2,
    "Second anchor href matches URL 2"
  );
  ok(anchors[1].textContent, "Second anchor has non-empty title");

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
});

/**
 * Test that the share item is visible when the first selected tab is about:blank
 * but another selected tab has a real URL.
 */
add_task(async function test_contextmenu_share_multiselect_blank_first_linux() {
  let tab1 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  let tab2 = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL_1);

  await triggerClickOn(tab1, { ctrlKey: true });
  ok(tab1.multiselected, "tab1 (blank) is multiselected");
  ok(tab2.multiselected, "tab2 (real URL) is multiselected");

  let contextMenu = await openTabContextMenu(tab1);
  let shareItem = contextMenu.querySelector(".share-tab-url-item");
  ok(shareItem, "share item exists");
  ok(
    !shareItem.hidden,
    "share item is visible when at least one tab has a shareable URL"
  );

  let contextMenuClosed = BrowserTestUtils.waitForPopupEvent(
    contextMenu,
    "hidden"
  );
  await SimpleTest.promiseClipboardChange(TEST_URL_1, () =>
    contextMenu.activateItem(shareItem)
  );
  await contextMenuClosed;

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
});

/**
 * Test that the share item is hidden when all selected tabs have non-shareable URLs.
 */
add_task(async function test_contextmenu_share_multiselect_all_blank_linux() {
  let tab1 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  let tab2 = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  await triggerClickOn(tab1, { ctrlKey: true });
  ok(tab1.multiselected, "tab1 is multiselected");
  ok(tab2.multiselected, "tab2 is multiselected");

  let contextMenu = await openTabContextMenu(tab2);
  let shareItem = contextMenu.querySelector(".share-tab-url-item");
  ok(shareItem, "share item exists");
  ok(
    shareItem.hidden,
    "share item is hidden when all selected tabs have non-shareable URLs"
  );

  let contextMenuClosed = BrowserTestUtils.waitForPopupEvent(
    contextMenu,
    "hidden"
  );
  contextMenu.hidePopup();
  await contextMenuClosed;

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
});

async function openTabContextMenu(tab) {
  info("Opening tab context menu");
  let contextMenu = document.getElementById("tabContextMenu");
  let openTabContextMenuPromise = BrowserTestUtils.waitForPopupEvent(
    contextMenu,
    "shown"
  );
  EventUtils.synthesizeMouseAtCenter(tab, { type: "contextmenu" });
  await openTabContextMenuPromise;
  return contextMenu;
}
