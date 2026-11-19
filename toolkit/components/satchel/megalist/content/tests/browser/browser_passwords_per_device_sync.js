/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { UIState } = ChromeUtils.importESModule(
  "resource://services-sync/UIState.sys.mjs"
);

const l10n = new Localization([
  "branding/brand.ftl",
  "browser/contextual-manager.ftl",
]);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.contextual-password-manager.enabled", true],
      ["signon.rememberSignons", true],
      ["toolkit.osKeyStore.unofficialBuildOnlyLogin", ""],
    ],
  });
  const getState = UIState.get;
  const originalPromptService = Services.prompt;
  registerCleanupFunction(async () => {
    UIState.get = getState;
    Services.prompt = originalPromptService;
    await LoginTestUtils.clearData();
  });
});

async function setSyncState({ perDeviceSyncEnabled, passwordSyncEnabled }) {
  UIState.get = () => ({
    status: UIState.STATUS_SIGNED_IN,
    syncEnabled: true,
    email: "test@example.com",
  });
  await SpecialPowers.pushPrefEnv({
    set: [
      ["services.sync.perDeviceEngineChoices", perDeviceSyncEnabled],
      ["services.sync.engine.passwords", passwordSyncEnabled],
    ],
  });
}

function mockCapturingPrompt() {
  const captured = {};
  const prompt = {
    async asyncConfirmEx(
      _browsingContext,
      _win,
      title,
      message,
      _flags,
      confirmButton,
      _button1,
      _button2,
      checkbox
    ) {
      captured.title = title;
      captured.message = message;
      captured.confirmButton = confirmButton;
      captured.checkbox = checkbox;
      return {
        // eslint-disable-next-line mozilla/use-chromeutils-generateqi
        QueryInterface() {
          const propBag = new Map();
          propBag.set("buttonNumClicked", 1);
          propBag.set("checked", false);
          return propBag;
        },
      };
    },
  };
  return { prompt, captured };
}

async function openMoreOptionsMenu(megalist) {
  await TestUtils.waitForCondition(
    () => megalist.querySelector("#more-options-menubutton"),
    "menu button failed to render"
  );
  const menu = megalist.querySelector("panel-list");
  megalist.querySelector("#more-options-menubutton").click();
  await BrowserTestUtils.waitForEvent(menu, "shown");
  return menu;
}

async function checkRemoveAll(
  expectedMenuItemId,
  expectedTitleId,
  expectedMessageId,
  expectedConfirmButtonId,
  expectedCheckboxId
) {
  try {
    const megalist = await openPasswordsSidebar();
    await addMockPasswords();
    await checkAllLoginsRendered(megalist);

    const menuItem = megalist.querySelector("[action='remove-all-logins']");
    await TestUtils.waitForCondition(
      () => menuItem.dataset.l10nId == expectedMenuItemId,
      `Waiting for the remove all menu item to use ${expectedMenuItemId}`
    );
    is(
      menuItem.dataset.l10nId,
      expectedMenuItemId,
      "Remove all menu item has the expected l10n id"
    );

    const { prompt, captured } = mockCapturingPrompt();
    Services.prompt = prompt;
    const menu = await openMoreOptionsMenu(megalist);
    menu
      .querySelector("[action='remove-all-logins']")
      .shadowRoot.querySelector("button")
      .click();
    await TestUtils.waitForCondition(
      () => captured.title,
      "Waiting for the remove all prompt"
    );

    const total = (await Services.logins.getAllLogins()).length;
    const [
      expectedTitle,
      expectedMessage,
      expectedConfirmButton,
      expectedCheckbox,
    ] = await l10n.formatValues([
      { id: expectedTitleId, args: { total } },
      { id: expectedMessageId, args: { total } },
      { id: expectedConfirmButtonId, args: { total } },
      { id: expectedCheckboxId, args: { total } },
    ]);
    ok(
      expectedTitle &&
        expectedMessage &&
        expectedConfirmButton &&
        expectedCheckbox,
      "Expected strings are localized"
    );
    is(captured.title, expectedTitle, "Prompt has the expected title");
    is(captured.message, expectedMessage, "Prompt has the expected message");
    is(
      captured.confirmButton,
      expectedConfirmButton,
      "Prompt has the expected confirm button"
    );
    is(captured.checkbox, expectedCheckbox, "Prompt has the expected checkbox");
    Assert.greater(
      total,
      0,
      "Logins were not removed after cancelling the prompt"
    );
  } finally {
    SidebarController.hide();
    await LoginTestUtils.clearData();
    await SpecialPowers.popPrefEnv();
  }
}

async function checkDeleteCard(
  expectedButtonId,
  expectedTitleId,
  expectedConfirmButtonId
) {
  try {
    if (!OSKeyStoreTestUtils.canTestOSKeyStoreLogin()) {
      ok(true, "Cannot test OSAuth.");
      return;
    }
    const megalist = await openPasswordsSidebar();
    await addMockPasswords();
    await checkAllLoginsRendered(megalist);

    const passwordCard = megalist.querySelector("password-card");
    await waitForReauth(() => passwordCard.editBtn.click());
    await TestUtils.waitForCondition(
      () => megalist.querySelector("login-form"),
      "Login form failed to render"
    );

    const loginForm = megalist.querySelector("login-form").shadowRoot;
    const deleteLoginBtn = loginForm.querySelector(".delete-login-button");
    is(
      deleteLoginBtn.dataset.l10nId,
      expectedButtonId,
      "Delete button has the expected l10n id"
    );

    deleteLoginBtn.click();
    await TestUtils.waitForCondition(
      () => loginForm.querySelector(".remove-login-card"),
      "Remove login card failed to render."
    );
    is(
      loginForm.querySelector(".remove-card-text h3").dataset.l10nId,
      expectedTitleId,
      "Delete card title has the expected l10n id"
    );
    is(
      loginForm.querySelector(".remove-login-card moz-button[type=destructive]")
        .dataset.l10nId,
      expectedConfirmButtonId,
      "Delete card confirm button has the expected l10n id"
    );

    loginForm
      .querySelector(
        "moz-button[data-l10n-id='contextual-manager-passwords-remove-login-card-cancel-button']"
      )
      .click();
    await TestUtils.waitForCondition(
      () => loginForm.querySelector("moz-input-text"),
      "Login form fields failed to render after cancelling."
    );
  } finally {
    SidebarController.hide();
    await LoginTestUtils.clearData();
    await SpecialPowers.popPrefEnv();
  }
}

add_task(async function test_per_device_sync_enabled() {
  await setSyncState({ perDeviceSyncEnabled: true, passwordSyncEnabled: true });
  await checkRemoveAll(
    "contextual-manager-passwords-command-delete-all",
    "contextual-manager-passwords-delete-all-title",
    "contextual-manager-passwords-delete-all-message-sync",
    "contextual-manager-passwords-delete-all-confirm-button",
    "contextual-manager-passwords-delete-all-passwords-checkbox"
  );
});

add_task(async function test_per_device_sync_disabled() {
  await setSyncState({
    perDeviceSyncEnabled: false,
    passwordSyncEnabled: true,
  });
  await checkRemoveAll(
    "contextual-manager-passwords-command-remove-all",
    "contextual-manager-passwords-remove-all-title",
    "contextual-manager-passwords-remove-all-message-sync",
    "contextual-manager-passwords-remove-all-confirm-button",
    "contextual-manager-passwords-remove-all-passwords-checkbox"
  );
});

add_task(async function test_per_device_sync_enabled_password_sync_disabled() {
  await setSyncState({
    perDeviceSyncEnabled: true,
    passwordSyncEnabled: false,
  });
  await checkRemoveAll(
    "contextual-manager-passwords-command-remove-all",
    "contextual-manager-passwords-remove-all-title",
    "contextual-manager-passwords-remove-all-message",
    "contextual-manager-passwords-remove-all-confirm-button",
    "contextual-manager-passwords-remove-all-passwords-checkbox"
  );
});

add_task(async function test_delete_card_per_device_sync_enabled() {
  await setSyncState({ perDeviceSyncEnabled: true, passwordSyncEnabled: true });
  await checkDeleteCard(
    "contextual-manager-passwords-delete-label",
    "contextual-manager-passwords-delete-login-card-title",
    "contextual-manager-passwords-delete-login-card-delete-button"
  );
});

add_task(async function test_delete_card_per_device_sync_disabled() {
  await setSyncState({
    perDeviceSyncEnabled: false,
    passwordSyncEnabled: true,
  });
  await checkDeleteCard(
    "contextual-manager-passwords-remove-label",
    "contextual-manager-passwords-remove-login-card-title",
    "contextual-manager-passwords-remove-login-card-remove-button"
  );
});

add_task(
  async function test_delete_card_per_device_sync_enabled_password_sync_disabled() {
    await setSyncState({
      perDeviceSyncEnabled: true,
      passwordSyncEnabled: false,
    });
    await checkDeleteCard(
      "contextual-manager-passwords-remove-label",
      "contextual-manager-passwords-remove-login-card-title",
      "contextual-manager-passwords-remove-login-card-remove-button"
    );
  }
);
