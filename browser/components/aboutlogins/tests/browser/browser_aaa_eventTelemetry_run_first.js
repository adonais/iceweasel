/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

requestLongerTimeout(2);

EXPECTED_BREACH = {
  AddedDate: "2018-12-20T23:56:26Z",
  BreachDate: "2018-12-16",
  Domain: "breached.example.com",
  Name: "Breached",
  PwnCount: 1643100,
  DataClasses: ["Email addresses", "Usernames", "Passwords", "IP addresses"],
  _status: "synced",
  id: "047940fe-d2fd-4314-b636-b4a952ee0043",
  last_modified: "1541615610052",
  schema: "1541615609018",
};

let VULNERABLE_TEST_LOGIN2 = new nsLoginInfo(
  "https://2.example.com",
  "https://2.example.com",
  null,
  "user2",
  "pass3",
  "username",
  "password"
);

add_setup(async function () {
  TEST_LOGIN1 = await addLogin(TEST_LOGIN1);
  VULNERABLE_TEST_LOGIN2 = await addLogin(VULNERABLE_TEST_LOGIN2);
  TEST_LOGIN3 = await addLogin(TEST_LOGIN3);

  Services.fog.testResetFOG();

  await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: "about:logins",
  });
  registerCleanupFunction(async () => {
    BrowserTestUtils.removeTab(gBrowser.selectedTab);
    await Services.logins.removeAllUserFacingLoginsAsync();
  });
});

add_task(async function test_telemetry_events() {
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginList = content.document.querySelector("login-list");
    let loginListItem = loginList.shadowRoot.querySelector(
      "login-list-item.breached"
    );
    loginListItem.click();
  });
  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.openManagementDirect.testGetValue().length,
    1,
    "One open event"
  );
  Assert.equal(
    Glean.pwmgr.selectExistingLogin.testGetValue().length,
    1,
    "One select event"
  );

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    let copyButton = loginItem.shadowRoot.querySelector("copy-username-button");
    copyButton.click();
  });
  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.copyUsername.testGetValue().length,
    1,
    "One copy event"
  );

  if (OSKeyStoreTestUtils.canTestOSKeyStoreLogin()) {
    let reauthObserved = Promise.resolve();
    if (OSKeyStore.canReauth()) {
      reauthObserved = OSKeyStoreTestUtils.waitForOSKeyStoreLogin(true);
    }
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
      let loginItem = content.document.querySelector("login-item");
      let copyButton = loginItem.shadowRoot.querySelector(
        "copy-password-button"
      );
      copyButton.click();
    });
    await reauthObserved;
    // When reauth is observed an extra event will be recorded
    // for the reauth, hence the event count increasing by 2 here, and later
    // in the test as well.
    await Services.fog.testFlushAllChildren();
    await TestUtils.waitForCondition(() => {
      return (
        Glean.pwmgr.reauthenticateOsAuth.testGetValue()?.length == 1 &&
        Glean.pwmgr.copyPassword.testGetValue()?.length == 1
      );
    }, "Wait for two pwmgr events.");
  }

  let promiseNewTab = BrowserTestUtils.waitForNewTab(
    gBrowser,
    TEST_LOGIN3.origin + "/"
  );
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    let originInput = loginItem.shadowRoot.querySelector(".origin-input");
    originInput.click();
  });
  let newTab = await promiseNewTab;
  Assert.ok(true, "New tab opened to " + TEST_LOGIN3.origin);
  BrowserTestUtils.removeTab(newTab);
  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.openSiteExistingLogin.testGetValue().length,
    1,
    "One open event"
  );

  // Show the password
  if (OSKeyStoreTestUtils.canTestOSKeyStoreLogin()) {
    let reauthObserved = Promise.resolve();
    if (OSKeyStore.canReauth()) {
      reauthObserved = forceAuthTimeoutAndWaitForOSKeyStoreLogin({
        loginResult: true,
      });
    }
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
      let loginItem = content.document.querySelector("login-item");
      let revealCheckbox = loginItem.shadowRoot.querySelector(
        ".reveal-password-checkbox"
      );
      revealCheckbox.click();
    });
    await reauthObserved;
    await Services.fog.testFlushAllChildren();
    Assert.equal(
      Glean.pwmgr.showPassword.testGetValue().length,
      1,
      "One show event"
    );

    // Hide the password
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
      let loginItem = content.document.querySelector("login-item");
      let revealCheckbox = loginItem.shadowRoot.querySelector(
        ".reveal-password-checkbox"
      );
      revealCheckbox.click();
    });
    await Services.fog.testFlushAllChildren();
    Assert.equal(
      Glean.pwmgr.hidePassword.testGetValue().length,
      1,
      "One hide event"
    );

    // Don't force the auth timeout here to check that `auth_skipped: true` is set as
    // in `extra`.
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
      let loginItem = content.document.querySelector("login-item");
      let editButton = loginItem.shadowRoot.querySelector("edit-button");
      editButton.click();
    });
    await Services.fog.testFlushAllChildren();
    Assert.equal(
      Glean.pwmgr.editExistingLogin.testGetValue().length,
      1,
      "One edit event"
    );

    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
      let loginItem = content.document.querySelector("login-item");
      let usernameField = loginItem.shadowRoot.querySelector(
        'input[name="username"]'
      );
      usernameField.value = "user1-modified";

      let saveButton = loginItem.shadowRoot.querySelector(
        ".save-changes-button"
      );
      saveButton.click();
    });
    await Services.fog.testFlushAllChildren();
    Assert.equal(
      Glean.pwmgr.saveExistingLogin.testGetValue().length,
      1,
      "One save event"
    );
  }

  // TODO: We have to sleep a bit here or else the following delete errors with "No matching logins".
  await new Promise(resolve => setTimeout(resolve, 100)); // eslint-disable-line mozilla/no-arbitrary-setTimeout

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    let deleteButton = loginItem.shadowRoot.querySelector("delete-button");
    deleteButton.click();
    let confirmDeleteDialog = content.document.querySelector(
      "confirmation-dialog"
    );
    let confirmDeleteButton =
      confirmDeleteDialog.shadowRoot.querySelector(".confirm-button");
    confirmDeleteButton.click();
  });
  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.deleteExistingLogin.testGetValue().length,
    1,
    "One delete event"
  );

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let newLoginButton = content.document
      .querySelector("login-list")
      .shadowRoot.querySelector("create-login-button");
    newLoginButton.click();
  });
  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.newNewLogin.testGetValue().length,
    1,
    "One new event"
  );

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    let cancelButton = loginItem.shadowRoot.querySelector(".cancel-button");
    cancelButton.click();
  });
  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.cancelNewLogin.testGetValue().length,
    1,
    "One cancel event"
  );

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginList = content.document.querySelector("login-list");
    let loginListItem = loginList.shadowRoot.querySelector(
      "login-list-item.vulnerable"
    );
    loginListItem.click();
  });
  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.selectExistingLogin.testGetValue().length,
    2,
    "Two select events"
  );

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    let copyButton = loginItem.shadowRoot.querySelector("copy-username-button");
    copyButton.click();
  });
  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.copyUsername.testGetValue().length,
    2,
    "Two copy events"
  );

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginItem = content.document.querySelector("login-item");
    let deleteButton = loginItem.shadowRoot.querySelector("delete-button");
    deleteButton.click();
    let confirmDeleteDialog = content.document.querySelector(
      "confirmation-dialog"
    );
    let confirmDeleteButton =
      confirmDeleteDialog.shadowRoot.querySelector(".confirm-button");
    confirmDeleteButton.click();
  });
  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.deleteExistingLogin.testGetValue().length,
    2,
    "Two delete events"
  );

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    let loginSort = content.document
      .querySelector("login-list")
      .shadowRoot.querySelector("#login-sort");
    loginSort.value = "last-used";
    loginSort.dispatchEvent(new content.Event("change", { bubbles: true }));
  });
  await Services.fog.testFlushAllChildren();
  Assert.equal(Glean.pwmgr.sortList.testGetValue().length, 1, "One sort event");
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("signon.management.page.sort");
  });

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async function () {
    const loginList = content.document.querySelector("login-list");
    const loginFilter = loginList.shadowRoot.querySelector("login-filter");
    const input = loginFilter.shadowRoot.querySelector("input");
    input.setUserInput("test");
  });
  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.filterList.testGetValue().length,
    1,
    "One filter event"
  );
});
