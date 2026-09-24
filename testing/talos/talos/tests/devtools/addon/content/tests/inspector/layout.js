/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  openToolbox,
  closeToolbox,
  runTest,
  testSetup,
  testTeardown,
  SIMPLE_URL,
} = require("damp-test/tests/head");

module.exports = async function () {
  // Backup current sidebar tab preference
  let sidebarTab = Services.prefs.getCharPref(
    "devtools.inspector.activeSidebar"
  );

  // Set layoutview as the current inspector sidebar tab.
  Services.prefs.setCharPref("devtools.inspector.activeSidebar", "layoutview");

  let tab = await testSetup(SIMPLE_URL);
  await testLayoutPanel(tab, {
    nodes: 5000,
    gridNodes: 10,
    label: "inspector.layout.open",
  });

  await testLayoutPanel(tab, {
    nodes: 500,
    gridNodes: 2000,
    label: "inspector.layout.many-grid-containers.open",
  });

  // Restore sidebar tab preference.
  Services.prefs.setCharPref("devtools.inspector.activeSidebar", sidebarTab);

  await testTeardown();
};

async function testLayoutPanel(tab, { nodes, gridNodes, label }) {
  let messageManager = tab.linkedBrowser.messageManager;

  // Setup test page.
  await new Promise(resolve => {
    messageManager.addMessageListener("setup-test-done", resolve);

    messageManager.loadFrameScript(
      "data:,(" +
        encodeURIComponent(
          `function () {
        let div = content.document.createElement("div");
        div.innerHTML =
          new Array(${nodes}).join("<div></div>") +
          new Array(${gridNodes}).join("<div style='display:grid'></div>");
        content.document.body.appendChild(div);
        sendSyncMessage("setup-test-done");
      }`
        ) +
        ")()",
      false
    );
  });

  // Record the time needed to open and close the toolbox. openToolbox does not wait
  // for the layout panel to be populated, and retrieving the grid list is the
  // expensive part on pages with many grid containers, so wait for it explicitly.
  let test = runTest(label);
  await openToolbox("inspector", async (_toolbox, inspector) => {
    // See openInspectorSidebarTab in devtools/client/inspector/test/shared-head.js
    // https://searchfox.org/firefox-main/rev/f601d09ece2964b08e7be2a6b05f0fb57e567876/devtools/client/inspector/test/shared-head.js#64-71
    await inspector.getPanel("boxmodel").initialized;
    await inspector.getPanel("layoutview").gridInspector.initialized;
  });
  test.done();

  await closeToolbox();
}
