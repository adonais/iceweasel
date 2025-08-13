/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.contextual-password-manager.enabled", true],
      ["signon.rememberSignons", true],
    ],
  });
  registerCleanupFunction(LoginTestUtils.clearData);
});

async function checkEmptyState(selector, megalist) {
  return await BrowserTestUtils.waitForCondition(() => {
    const emptyStateCard = megalist.querySelector(".empty-state-card");
    return !!emptyStateCard?.querySelector(selector);
  }, "Empty state card failed to render");
}

async function clickRemoveAllPasswords(megalist) {
  const getShadowBtn = (el, selector) =>
    el.querySelector(selector).shadowRoot.querySelector("button");
  const menu = megalist.querySelector("panel-list");

  await BrowserTestUtils.waitForCondition(
    () => megalist.querySelector("#more-options-menubutton"),
    "menu button failed to render"
  );

  const menuButton = megalist.querySelector("#more-options-menubutton");
  menuButton.click();
  await BrowserTestUtils.waitForEvent(menu, "shown");
  const removeAllMenuItem = getShadowBtn(menu, "[action='remove-all-logins']");
  removeAllMenuItem.click();
}

add_task(async function test_passwords_remove_all_notification() {
  Services.fog.testResetFOG();
  await Services.fog.testFlushAllChildren();
  info("Check that notification is shown when user removes all passwords.");
  const megalist = await openPasswordsSidebar();
  await addMockPasswords();
  await checkAllLoginsRendered(megalist);
  await BrowserTestUtils.waitForCondition(
    () => megalist.querySelector(".second-row"),
    "Second row failed to render"
  );

  const originalPromptService = Services.prompt;
  Services.prompt = mockServicePrompt();

  await clickRemoveAllPasswords(megalist);
  const notifMsgBar = await checkNotificationAndTelemetry(
    megalist,
    "delete-login-success"
  );
  ok(true, "Notification is shown.");

  checkNotificationInteractionTelemetry(notifMsgBar, "primary-action", {
    notification_detail: "delete_login_success",
    action_type: "dismiss",
  });

  await checkEmptyState(".no-logins-card-content", megalist);
  ok(true, "Empty state rendered after logins are removed.");

  info("Closing the sidebar");
  SidebarController.hide();
  Services.prompt = originalPromptService;
});

add_task(async function test_remove_all_passwords_checkbox() {
  info("Check that passwords are not removed when prompt checkbox is checked");
  const megalist = await openPasswordsSidebar();
  await addMockPasswords();
  await checkAllLoginsRendered(megalist);
  await BrowserTestUtils.waitForCondition(
    () => megalist.querySelector(".second-row"),
    "Second row failed to render"
  );

  const originalPromptService = Services.prompt;
  Services.prompt = mockServicePrompt(0, true);
  await clickRemoveAllPasswords(megalist);

  const logins = await Services.logins.getAllLogins();

  ok(!!logins.length, "Logins were not removed");

  info("Closing the sidebar");
  SidebarController.hide();
  Services.prompt = originalPromptService;
});
