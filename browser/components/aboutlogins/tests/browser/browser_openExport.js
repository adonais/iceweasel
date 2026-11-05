/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test the export logins file picker appears.
 */

let { MockFilePicker } = SpecialPowers;

add_setup(async function () {
  const exampleLogin = LoginTestUtils.testData.formLogin({
    origin: "https://www.example.com",
    formActionOrigin: "https://www.example.com",
    username: "username",
    password: "password",
    timePasswordChanged: new Date("2025-02-05").getTime(),
  });
  await Services.logins.addLoginAsync(exampleLogin);
  Services.fog.testResetFOG();

  MockFilePicker.init();
  MockFilePicker.useAnyFile();
  MockFilePicker.returnValue = MockFilePicker.returnOK;

  await SpecialPowers.pushPrefEnv({
    set: [["toolkit.osKeyStore.unofficialBuildOnlyLogin", ""]],
  });

  registerCleanupFunction(() => {
    MockFilePicker.cleanup();
    LoginTestUtils.clearData();
  });
});

function waitForFilePicker() {
  return new Promise(resolve => {
    MockFilePicker.showCallback = () => {
      MockFilePicker.showCallback = null;
      Assert.ok(true, "Saw the file picker");
      resolve();
    };
  });
}

add_task(async function test_open_export() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:logins" },
    async function (browser) {
      await BrowserTestUtils.synthesizeMouseAtCenter(
        "menu-button",
        {},
        browser
      );

      await SpecialPowers.spawn(browser, [], async () => {
        let menuButton = content.document.querySelector("menu-button");
        return ContentTaskUtils.waitForCondition(function waitForMenu() {
          return !menuButton.shadowRoot.querySelector(".menu").hidden;
        }, "waiting for menu to open");
      });

      function getExportMenuItem() {
        let menuButton = window.document.querySelector("menu-button");
        let exportButton =
          menuButton.shadowRoot.querySelector(".menuitem-export");
        return exportButton;
      }

      await BrowserTestUtils.synthesizeMouseAtCenter(
        getExportMenuItem,
        {},
        browser
      );

      await Services.fog.testFlushAllChildren();
      Assert.equal(
        Glean.pwmgr.mgmtMenuItemUsedExport.testGetValue().length,
        1,
        "One export event"
      );

      info("Clicking confirm button");
      let osReAuthPromise = null;

      if (
        OSKeyStore.canReauth() &&
        !OSKeyStoreTestUtils.canTestOSKeyStoreLogin()
      ) {
        todo(
          OSKeyStoreTestUtils.canTestOSKeyStoreLogin(),
          "Cannot test OS key store login in this build."
        );
        return;
      }

      if (OSKeyStore.canReauth()) {
        osReAuthPromise = OSKeyStoreTestUtils.waitForOSKeyStoreLogin(true);
      }
      let filePicker = waitForFilePicker();
      await BrowserTestUtils.synthesizeMouseAtCenter(
        () => {
          let confirmExportDialog = window.document.querySelector(
            "confirmation-dialog"
          );
          return confirmExportDialog.shadowRoot.querySelector(
            ".confirm-button"
          );
        },
        {},
        browser
      );

      if (osReAuthPromise) {
        Assert.ok(osReAuthPromise, "Waiting for OS re-auth promise");
        await osReAuthPromise;
      }

      info("waiting for Export file picker to get opened");
      await filePicker;
      Assert.ok(true, "Export file picker opened");

      info("Waiting for the export to complete");
      await TestUtils.waitForCondition(() => {
        return (
          Glean.pwmgr.reauthenticateOsAuth.testGetValue()?.length == 1 &&
          Glean.pwmgr.mgmtMenuItemUsedExportComplete.testGetValue()?.length == 1
        );
      }, "Waiting for the export to complete.");
      Assert.equal(
        Glean.pwmgr.reauthenticateOsAuth.testGetValue()[0].extra.value,
        osReAuthPromise ? "success" : "success_unsupported_platform",
        "Reauthenticate event reports expected success reason"
      );
    }
  );
});
