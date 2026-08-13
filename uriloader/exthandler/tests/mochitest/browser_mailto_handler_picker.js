/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { nsContentDispatchChooser } = ChromeUtils.importESModule(
  "resource://gre/modules/ContentDispatchChooser.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  NimbusTestUtils: "resource://testing-common/NimbusTestUtils.sys.mjs",
});

const HANDLER_NAME = "Test Webmail";
const URI_TEMPLATE =
  "https://example.com/browser/uriloader/exthandler/tests/mochitest/" +
  "blank_webmail.html?to=%s";
const MAILTO = "mailto:test@example.com";
const EXPECTED_URL =
  "https://example.com/browser/uriloader/exthandler/tests/mochitest/" +
  "blank_webmail.html?to=" +
  encodeURIComponent(MAILTO);

function getMailtoInfoWithWebHandler() {
  const protoSvc = Cc[
    "@mozilla.org/uriloader/external-protocol-service;1"
  ].getService(Ci.nsIExternalProtocolService);
  const info = protoSvc.getProtocolHandlerInfo("mailto");

  // The shipped handler list seeds mailto with real web mailers (e.g. Gmail).
  // The picker loads each web handler's favicon from its origin, which under
  // test is a forbidden non-local connection that crashes the parent process,
  // and also makes this test depend on the ambient (region/locale-specific)
  // list. Drop the seeded handlers so only our local test handler remains.
  const handlers = info.possibleApplicationHandlers;
  for (let i = handlers.length - 1; i >= 0; i--) {
    handlers.removeElementAt(i);
  }

  const webHandler = Cc[
    "@mozilla.org/uriloader/web-handler-app;1"
  ].createInstance(Ci.nsIWebHandlerApp);
  webHandler.name = HANDLER_NAME;
  webHandler.uriTemplate = URI_TEMPLATE;
  info.possibleApplicationHandlers.appendElement(webHandler);

  // The picker is only shown when "always ask" is configured for mailto.
  info.alwaysAskBeforeHandling = true;

  return info;
}

function rowByName(win, name) {
  return [...win.document.querySelectorAll("#items richlistitem")].find(
    item => item.getAttribute("name") === name
  );
}

function dialogButton(win, type) {
  return win.document.querySelector("dialog").getButton(type);
}

add_setup(async function () {
  // The picker is gated behind the "dialog" variable of the "mailto" Nimbus
  // feature, so enroll to enable it for the duration of this test.
  const nimbusCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "mailto",
    value: { dialog: true },
  });
  registerCleanupFunction(async () => {
    await nimbusCleanup();
  });
});

// Selecting a web mailer and confirming with "Set as default" should open it in
// a new foreground tab with the mailto: URI substituted into the handler's
// template, and close the picker dialog.
add_task(async function test_picker_opens_webmailer_in_new_foreground_tab() {
  const browser = gBrowser.selectedBrowser;
  const principal = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI("https://example.com"),
    {}
  );
  const mailtoInfo = getMailtoInfoWithWebHandler();
  const chooser = new nsContentDispatchChooser();

  // handleURI resolves only once the picker is dismissed, so don't await it
  // until after we have interacted with the dialog.
  const handlePromise = chooser.handleURI(
    mailtoInfo,
    Services.io.newURI(MAILTO),
    principal,
    browser.browsingContext,
    false
  );

  const [dialogWin] = await TestUtils.topicObserved("subdialog-loaded");
  await TestUtils.waitForCondition(
    () => rowByName(dialogWin, HANDLER_NAME),
    "Picker row for the configured web handler is rendered"
  );
  const row = rowByName(dialogWin, HANDLER_NAME);
  Assert.ok(row, "Found the web mailer row in the picker");

  const newTabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    EXPECTED_URL,
    true
  );

  // Select the web mailer, then confirm with the "Set as default" button.
  dialogWin.document.getElementById("items").selectedItem = row;
  dialogButton(dialogWin, "accept").click();

  const newTab = await newTabPromise;
  await handlePromise;

  Assert.equal(
    gBrowser.selectedTab,
    newTab,
    "The new web mailer tab is selected (opened in the foreground)"
  );
  Assert.equal(
    newTab.linkedBrowser.currentURI.spec,
    EXPECTED_URL,
    "The mailto: URI was substituted into the handler's URI template"
  );
  Assert.ok(
    !browser.documentGlobal.gDialogBox?.isOpen,
    "The picker dialog was closed after a selection"
  );

  BrowserTestUtils.removeTab(newTab);
});

// Clicking "Not now" should dismiss the picker without launching anything or
// opening a tab.
add_task(async function test_dismiss_picker_launches_nothing() {
  const initialTabCount = gBrowser.tabs.length;
  const browser = gBrowser.selectedBrowser;
  const principal = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI("https://example.com"),
    {}
  );
  const mailtoInfo = getMailtoInfoWithWebHandler();
  const chooser = new nsContentDispatchChooser();

  const handlePromise = chooser.handleURI(
    mailtoInfo,
    Services.io.newURI(MAILTO),
    principal,
    browser.browsingContext,
    false
  );

  const [dialogWin] = await TestUtils.topicObserved("subdialog-loaded");
  await TestUtils.waitForCondition(
    () => dialogButton(dialogWin, "cancel"),
    "The 'Not now' button is rendered"
  );

  dialogButton(dialogWin, "cancel").click();
  await handlePromise;

  Assert.equal(
    gBrowser.tabs.length,
    initialTabCount,
    "No new tab is opened when the picker is dismissed"
  );
  Assert.ok(
    !browser.documentGlobal.gDialogBox?.isOpen,
    "The picker dialog was closed"
  );
});
