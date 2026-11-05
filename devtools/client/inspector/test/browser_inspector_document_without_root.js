/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test that the inspector works when it initializes for a document which has
// no root element yet.

let pendingResponse = null;
registerCleanupFunction(() => pendingResponse?.finish());

const server = createTestHTTPServer();
server.registerPathHandler("/slow.html", (metadata, response) => {
  response.processAsync();
  response.setHeader("Content-Type", "text/html; charset=utf-8", false);
  // A comment before <html> creates the document but not its root element.
  response.write("<!-- The root element will be sent later -->");
  pendingResponse = response;
});
const SLOW_URL = `http://localhost:${server.identity.primaryPort}/slow.html`;

add_task(async function test_open_inspector_with_no_root() {
  const tab = BrowserTestUtils.addTab(gBrowser, SLOW_URL);
  gBrowser.selectedTab = tab;
  await waitForDocumentWithoutRoot(tab);

  info("Open the inspector while the document has no root element");
  const toolbox = await openToolboxForTab(tab, "inspector");
  const inspector = toolbox.getPanel("inspector");

  // At this point the inspector should still be waiting for its root element.
  ok(
    !inspector.panelDoc.querySelector(".app-error-panel"),
    "The inspector error panel is not displayed"
  );

  await finishResponseAndCheckSelection(inspector);
  await closeTabAndToolbox(tab);
});

add_task(async function test_navigate_inspector_with_no_root() {
  const { inspector, toolbox } = await openInspectorForURL(
    "data:text/html,<div>first</div>"
  );

  info("Navigate to a page which sends a partial response");
  const onTargetSwitched =
    toolbox.commands.targetCommand.once("switched-target");
  BrowserTestUtils.startLoadingURIString(gBrowser.selectedBrowser, SLOW_URL);
  await waitForDocumentWithoutRoot(gBrowser.selectedTab);
  await onTargetSwitched;

  await finishResponseAndCheckSelection(inspector);
  ok(
    !inspector.panelDoc.querySelector(".app-error-panel"),
    "The inspector error panel is not displayed"
  );
});

/**
 * Send the rest of the slow response, wait for the inspector to update, and
 * check that the default node is selected.
 *
 * @param {Inspector} inspector
 */
async function finishResponseAndCheckSelection(inspector) {
  info("Send the rest of the response");
  const onReloaded = inspector.once("reloaded");
  pendingResponse.write("<html><body><div>second</div></body></html>");
  pendingResponse.finish();
  pendingResponse = null;
  await onReloaded;

  // Depending on timing, the root element can be found before the body.
  const { nodeName } = inspector.selection.nodeFront;
  ok(
    ["HTML", "BODY"].includes(nodeName),
    `The default node is selected (${nodeName})`
  );
}

/**
 * Wait until the tab shows the slow document, and check that this document has
 * no root element yet.
 *
 * @param {Tab} tab
 */
async function waitForDocumentWithoutRoot(tab) {
  await waitFor(() => pendingResponse, "Wait for the slow request");
  // Wait in the parent process, the tab might still switch process before
  // the slow document is committed.
  await waitFor(
    () => tab.linkedBrowser.currentURI.spec === SLOW_URL,
    "Wait for the slow document to be committed"
  );
  const hasRoot = await SpecialPowers.spawn(
    tab.linkedBrowser,
    [],
    () => !!content.document.documentElement
  );
  ok(!hasRoot, "The slow document has no root element yet");
}
