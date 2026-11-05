"use strict";

add_setup(async function () {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [["toolkit.osKeyStore.unofficialBuildOnlyLogin", ""]],
  });
});

add_task(async function test_openPasswordManagement() {
  await openPreferencesViaOpenPreferencesAPI("privacy", { leaveOpen: true });

  let tabOpenPromise = BrowserTestUtils.waitForNewTab(gBrowser, "about:logins");

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    let doc = content.document;

    let savePasswordCheckBox = doc.getElementById("savePasswords");
    Assert.ok(
      !savePasswordCheckBox.checked,
      "Save Password CheckBox should be unchecked by default"
    );

    let showPasswordsButton = doc
      .getElementById("manageSavedPasswords")
      /**
       * Must test clicking on shadowRoot anchor or a11y checks will fail.
       */
      .shadowRoot.querySelector("a");
    showPasswordsButton.click();
  });

  let tab = await tabOpenPromise;
  ok(tab, "Tab opened");

  // check telemetry events while we are in here
  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.openManagementPreferences.testGetValue().length,
    1,
    "One open event"
  );

  BrowserTestUtils.removeTab(tab);
  gBrowser.removeCurrentTab();
});
