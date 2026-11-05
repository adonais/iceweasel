/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_setup(async function () {
  Services.fog.testResetFOG();

  let aboutLoginsTab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: "about:logins",
  });
  registerCleanupFunction(() => {
    BrowserTestUtils.removeTab(aboutLoginsTab);
  });
});

add_task(async function test_open_import() {
  let promiseWizardTab = BrowserTestUtils.waitForMigrationWizard(window);

  let browser = gBrowser.selectedBrowser;
  await BrowserTestUtils.synthesizeMouseAtCenter("menu-button", {}, browser);
  await SpecialPowers.spawn(browser, [], async () => {
    return ContentTaskUtils.waitForCondition(() => {
      let menuButton = Cu.waiveXrays(
        content.document.querySelector("menu-button")
      );
      return !menuButton.shadowRoot.querySelector(".menu").hidden;
    }, "waiting for menu to open");
  });

  function getImportItem() {
    let menuButton = window.document.querySelector("menu-button");
    return menuButton.shadowRoot.querySelector(".menuitem-import-browser");
  }
  await BrowserTestUtils.synthesizeMouseAtCenter(getImportItem, {}, browser);

  info("waiting for migration wizard to open");
  let wizardTab = await promiseWizardTab;
  Assert.ok(wizardTab, "Migration wizard opened");

  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.mgmtMenuItemUsedImportFromBrowser.testGetValue().length,
    1,
    "One import event"
  );

  await BrowserTestUtils.removeTab(wizardTab);
});
