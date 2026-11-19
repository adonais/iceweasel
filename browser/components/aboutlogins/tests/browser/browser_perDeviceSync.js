/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { UIState } = ChromeUtils.importESModule(
  "resource://services-sync/UIState.sys.mjs"
);
const { FxAccounts } = ChromeUtils.importESModule(
  "resource://gre/modules/FxAccounts.sys.mjs"
);

const PER_DEVICE_SYNC_PREF = "services.sync.perDeviceEngineChoices";

async function setSyncState({ perDeviceSyncEnabled, passwordSyncEnabled }) {
  UIState.get = () => ({
    status: UIState.STATUS_SIGNED_IN,
    syncEnabled: true,
    lastSync: new Date(),
    email: "test@example.com",
  });
  await SpecialPowers.pushPrefEnv({
    set: [
      [PER_DEVICE_SYNC_PREF, perDeviceSyncEnabled],
      ["services.sync.engine.passwords", passwordSyncEnabled],
    ],
  });
  Services.obs.notifyObservers(null, UIState.ON_UPDATE);
}

async function checkRemoveAllMenuItemAndDeleteButton(
  browser,
  expectedMenuItemId,
  expectedDeleteButtonId
) {
  await SpecialPowers.spawn(
    browser,
    [expectedMenuItemId, expectedDeleteButtonId],
    async (menuItemId, deleteButtonId) => {
      let menuItem = content.document
        .querySelector("menu-button")
        .shadowRoot.querySelector(".menuitem-remove-all-logins");
      await ContentTaskUtils.waitForCondition(
        () => menuItem.dataset.l10nId == menuItemId,
        `Waiting for the remove all menu item to use ${menuItemId}`
      );
      Assert.equal(
        menuItem.dataset.l10nId,
        menuItemId,
        "Remove all menu item has the expected l10n id"
      );

      let deleteButton = content.document
        .querySelector("login-item")
        .shadowRoot.querySelector("delete-button");
      await ContentTaskUtils.waitForCondition(
        () =>
          deleteButton.shadowRoot.querySelector("button span")?.dataset
            .l10nId == deleteButtonId,
        `Waiting for the delete button to use ${deleteButtonId}`
      );
      Assert.equal(
        deleteButton.shadowRoot.querySelector("button span").dataset.l10nId,
        deleteButtonId,
        "Delete button has the expected l10n id"
      );
    }
  );
}

async function checkRemoveAllDialog(
  browser,
  expectedTitleId,
  expectedMsgId,
  expectedCheckboxId,
  expectedConfirmButtonId
) {
  await SpecialPowers.spawn(
    browser,
    [
      expectedTitleId,
      expectedMsgId,
      expectedCheckboxId,
      expectedConfirmButtonId,
    ],
    async (titleId, messageId, checkboxId, confirmButtonId) => {
      let dialog = Cu.waiveXrays(
        content.document.querySelector("remove-logins-dialog")
      );
      content.dispatchEvent(
        new content.CustomEvent("AboutLoginsRemoveAllLoginsDialog")
      );
      await ContentTaskUtils.waitForCondition(
        () => !dialog.hidden,
        "Waiting for the remove all dialog to be shown"
      );

      let title = dialog.shadowRoot.querySelector(".title");
      let message = dialog.shadowRoot.querySelector(".message");
      Assert.equal(
        title.dataset.l10nId,
        titleId,
        "Dialog title has the expected l10n id"
      );
      Assert.equal(
        message.dataset.l10nId,
        messageId,
        "Dialog message has the expected l10n id"
      );
      Assert.equal(
        JSON.parse(title.dataset.l10nArgs).count,
        1,
        "Dialog title has the login count"
      );
      Assert.equal(
        dialog.shadowRoot.querySelector(".checkbox-text").dataset.l10nId,
        checkboxId,
        "Dialog checkbox has the expected l10n id"
      );
      Assert.equal(
        dialog.shadowRoot.querySelector(".confirm-button").dataset.l10nId,
        confirmButtonId,
        "Dialog confirm button has the expected l10n id"
      );

      dialog.shadowRoot.querySelector(".cancel-button").click();
      await ContentTaskUtils.waitForCondition(
        () => dialog.hidden,
        "Waiting for the remove all dialog to be hidden"
      );
    }
  );
}

async function checkDeleteDialog(
  browser,
  expectedTitleId,
  expectedMsgId,
  expectedConfirmButtonId
) {
  await SpecialPowers.spawn(
    browser,
    [expectedTitleId, expectedMsgId, expectedConfirmButtonId],
    async (titleId, messageId, confirmButtonId) => {
      let loginItem = Cu.waiveXrays(
        content.document.querySelector("login-item")
      );
      let dialog = Cu.waiveXrays(
        content.document.querySelector("confirmation-dialog")
      );
      let showPromise = loginItem.showConfirmationDialog("delete");
      Assert.ok(!dialog.hidden, "Delete dialog is shown");

      Assert.equal(
        dialog.shadowRoot.querySelector(".title").dataset.l10nId,
        titleId,
        "Delete dialog title has the expected l10n id"
      );
      Assert.equal(
        dialog.shadowRoot.querySelector(".message").dataset.l10nId,
        messageId,
        "Delete dialog message has the expected l10n id"
      );
      Assert.equal(
        dialog.shadowRoot.querySelector(".confirm-button").dataset.l10nId,
        confirmButtonId,
        "Delete dialog confirm button has the expected l10n id"
      );

      dialog.shadowRoot.querySelector(".cancel-button").click();
      let rejected = false;
      try {
        await showPromise;
      } catch {
        rejected = true;
      }
      Assert.ok(rejected, "Delete dialog promise rejects when cancelled");
      await ContentTaskUtils.waitForCondition(
        () => dialog.hidden,
        "Waiting for the delete dialog to be hidden"
      );
    }
  );
}

add_setup(async function () {
  let getState = UIState.get;
  sinon
    .stub(FxAccounts.config, "promiseManageURI")
    .returns("https://example.com/");
  TEST_LOGIN1 = await addLogin(TEST_LOGIN1);
  let aboutLoginsTab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: "about:logins",
  });
  registerCleanupFunction(async () => {
    BrowserTestUtils.removeTab(aboutLoginsTab);
    UIState.get = getState;
    sinon.restore();
    await Services.logins.removeAllUserFacingLoginsAsync();
  });
});

add_task(async function test_per_device_sync_enabled() {
  await setSyncState({ perDeviceSyncEnabled: true, passwordSyncEnabled: true });
  let browser = gBrowser.selectedBrowser;

  await checkRemoveAllMenuItemAndDeleteButton(
    browser,
    "about-logins-menu-menuitem-delete-all-logins",
    "about-logins-login-item-delete-button"
  );
  await checkRemoveAllDialog(
    browser,
    "about-logins-confirm-delete-all-sync-dialog-title",
    "about-logins-confirm-delete-all-sync-dialog-message",
    "about-logins-confirm-delete-all-dialog-checkbox-label",
    "about-logins-confirm-delete-all-dialog-confirm-button-label"
  );
  await checkDeleteDialog(
    browser,
    "about-logins-confirm-delete-dialog-title2",
    "about-logins-confirm-delete-dialog-message2",
    "about-logins-confirm-delete-dialog-confirm-button"
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_per_device_sync_disabled() {
  await setSyncState({
    perDeviceSyncEnabled: false,
    passwordSyncEnabled: true,
  });
  let browser = gBrowser.selectedBrowser;

  await checkRemoveAllMenuItemAndDeleteButton(
    browser,
    "about-logins-menu-menuitem-remove-all-logins2",
    "about-logins-login-item-remove-button"
  );
  await checkRemoveAllDialog(
    browser,
    "about-logins-confirm-remove-all-sync-dialog-title2",
    "about-logins-confirm-remove-all-sync-dialog-message3",
    "about-logins-confirm-remove-all-dialog-checkbox-label2",
    "about-logins-confirm-remove-all-dialog-confirm-button-label"
  );
  await checkDeleteDialog(
    browser,
    "about-logins-confirm-delete-dialog-title",
    "about-logins-confirm-delete-dialog-message",
    "about-logins-confirm-remove-dialog-confirm-button"
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_per_device_sync_enabled_password_sync_disabled() {
  await setSyncState({
    perDeviceSyncEnabled: true,
    passwordSyncEnabled: false,
  });
  let browser = gBrowser.selectedBrowser;

  await checkRemoveAllMenuItemAndDeleteButton(
    browser,
    "about-logins-menu-menuitem-remove-all-logins2",
    "about-logins-login-item-remove-button"
  );
  await checkRemoveAllDialog(
    browser,
    "about-logins-confirm-remove-all-dialog-title2",
    "about-logins-confirm-remove-all-dialog-message2",
    "about-logins-confirm-remove-all-dialog-checkbox-label2",
    "about-logins-confirm-remove-all-dialog-confirm-button-label"
  );
  await checkDeleteDialog(
    browser,
    "about-logins-confirm-delete-dialog-title",
    "about-logins-confirm-delete-dialog-message",
    "about-logins-confirm-remove-dialog-confirm-button"
  );
  await SpecialPowers.popPrefEnv();
});
