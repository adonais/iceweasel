/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async () => {
  // Load the initial tab at example.com. This makes it so that if
  // when loading the migration wizard in about:preferences, we'll
  // load the about:preferences page in a new tab rather than overtaking
  // the initial one. This makes cleanup of that opened tab more explicit.
  let browser = gBrowser.selectedBrowser;
  BrowserTestUtils.startLoadingURIString(browser, "https://example.com");
  await BrowserTestUtils.browserLoaded(browser);
});

add_task(async function test_SHOW_MIGRATION_WIZARD() {
  let wizardOpened = BrowserTestUtils.waitForMigrationWizard(window);

  await SMATestUtils.executeAndValidateAction({
    type: "SHOW_MIGRATION_WIZARD",
  });

  let wizard = await wizardOpened;
  ok(wizard, "Migration wizard opened");
  await BrowserTestUtils.removeTab(wizard);
});

add_task(async function test_SHOW_MIGRATION_WIZARD_WITH_SOURCE() {
  let wizardOpened = BrowserTestUtils.waitForMigrationWizard(window);

  await SMATestUtils.executeAndValidateAction({
    type: "SHOW_MIGRATION_WIZARD",
    data: { source: "chrome" },
  });

  let wizard = await wizardOpened;
  ok(wizard, "Migrator window opened when source param specified");
  await BrowserTestUtils.removeTab(wizard);
});

add_task(async function test_SHOW_MIGRATION_WIZARD_TAB_MODAL() {
  let tabCount = gBrowser.tabs.length;
  let manager = gBrowser
    .getTabDialogBox(gBrowser.selectedBrowser)
    .getContentDialogManager();

  await SMATestUtils.executeAndValidateAction({
    type: "SHOW_MIGRATION_WIZARD",
    data: { tabModal: true },
  });

  await TestUtils.waitForCondition(
    () => manager._dialogs.length,
    "Waiting for the tab dialog to open"
  );
  let [dialog] = manager._dialogs;
  await dialog._dialogReady;
  is(
    dialog._openedURL,
    "chrome://browser/content/migration/migration-dialog-window.html",
    "Migration wizard opened as a tab dialog"
  );
  is(gBrowser.tabs.length, tabCount, "No about:preferences tab was opened");

  let wizard =
    dialog.frameContentWindow.document.querySelector("migration-wizard");
  await TestUtils.waitForCondition(() => {
    let deck = wizard.shadowRoot?.querySelector("#wizard-deck");
    return deck && !deck.hasAttribute("aria-busy");
  }, "Waiting for the wizard to finish loading");
  dialog.close();
  await TestUtils.waitForCondition(
    () => !manager._dialogs.length,
    "Waiting for the tab dialog to close"
  );
});
