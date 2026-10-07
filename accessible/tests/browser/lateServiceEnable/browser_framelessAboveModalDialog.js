/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test initial tree rendering of a frameless, display: contents element whose
 * nearest framed ancestor is inert because a descendant several levels further
 * down is a modal <dialog>.
 */
async function testFramelessAboveModalDialog(markup) {
  ok(!Services.appinfo.accessibilityEnabled, "a11y disabled at start");

  const docId = "testDoc";
  const url = snippetToURL(markup, { contentDocAttrs: { id: docId } });
  const tab = BrowserTestUtils.addTab(gBrowser, url);
  gBrowser.selectedTab = tab;
  const browser = tab.linkedBrowser;
  registerCleanupFunction(() => {
    if (tab && !tab.closing && tab.linkedBrowser) {
      gBrowser.removeTab(tab);
    }
  });
  await BrowserTestUtils.browserLoaded(browser);

  ok(!Services.appinfo.accessibilityEnabled, "a11y still disabled after load");

  const docLoaded = waitForEvent(EVENT_DOCUMENT_LOAD_COMPLETE, docId);
  gAccService = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  gAccService.setCacheDomains(CacheDomain.All);
  let docAcc = (await docLoaded).accessible;

  testAccessibleTree(docAcc, {
    DOCUMENT: [{ DIALOG: [{ PUSHBUTTON: { name: "click me" } }] }],
  });

  docAcc = null;
  gBrowser.removeTab(tab);
  await shutdownAccService();
}

// A <slot> (display: contents by default) assigned a modal <dialog>.
add_task(async function testSlotAboveModalDialog() {
  await testFramelessAboveModalDialog(`
    <div id="container">
      <div id="host"></div>
    </div>
    <script>
      const host = document.getElementById("host");
      host.attachShadow({ mode: "open" });
      host.shadowRoot.innerHTML = "<slot></slot>";
      const dialog = document.createElement("dialog");
      const button = document.createElement("button");
      button.textContent = "click me";
      dialog.appendChild(button);
      host.appendChild(dialog);
      dialog.showModal();
    </script>
  `);
});

// A plain display: contents element (no shadow DOM at all) directly
// containing a modal <dialog>.
add_task(async function testDisplayContentsAboveModalDialog() {
  await testFramelessAboveModalDialog(`
    <div id="container">
      <div id="host">
        <span id="wrapper" style="display: contents"></span>
      </div>
    </div>
    <script>
      const wrapper = document.getElementById("wrapper");
      const dialog = document.createElement("dialog");
      const button = document.createElement("button");
      button.textContent = "click me";
      dialog.appendChild(button);
      wrapper.appendChild(dialog);
      dialog.showModal();
    </script>
  `);
});
