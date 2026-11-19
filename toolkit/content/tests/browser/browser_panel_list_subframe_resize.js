/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_subframe_resize_does_not_hide_panel_list() {
  let xulPanel = document.createXULElement("panel");
  let panelList = document.createElement("panel-list");
  let item = document.createElement("panel-item");
  item.textContent = "item";
  panelList.appendChild(item);
  xulPanel.appendChild(panelList);
  document.getElementById("mainPopupSet").appendChild(xulPanel);

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    getRootDirectory(gTestPath) + "file_empty.html"
  );
  registerCleanupFunction(() => {
    BrowserTestUtils.removeTab(tab);
    xulPanel.remove();
  });
  ok(!tab.linkedBrowser.isRemoteBrowser, "The tab should be in-process");

  let xulPanelShown = BrowserTestUtils.waitForPopupEvent(xulPanel, "shown");
  panelList.show(null, gURLBar.inputField);
  await xulPanelShown;

  let subframeResized = BrowserTestUtils.waitForEvent(
    window,
    "resize",
    false,
    e => e.target == tab.linkedBrowser.contentWindow
  );
  tab.linkedBrowser.style.marginBottom = "10px";
  await subframeResized;
  ok(panelList.open, "A subframe resize should not hide the panel list");

  let xulPanelHidden = BrowserTestUtils.waitForPopupEvent(xulPanel, "hidden");
  panelList.hide();
  await xulPanelHidden;
});
