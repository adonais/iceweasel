/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { EnterprisePolicyTesting } = ChromeUtils.importESModule(
  "resource://testing-common/EnterprisePolicyTesting.sys.mjs"
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.contextual-password-manager.enabled", true],
      ["signon.rememberSignons", true],
    ],
  });
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      DisablePasswordReveal: true,
    },
  });
  registerCleanupFunction(async () => {
    await EnterprisePolicyTesting.setupPolicyEngineWithJson("");
    LoginTestUtils.clearData();
  });
});

add_task(async function test_reveal_button_hidden() {
  await addMockPasswords();
  const megalist = await openPasswordsSidebar();
  await checkAllLoginsRendered(megalist);

  const passwordCard = megalist.querySelector("password-card");
  await passwordCard.updateComplete;
  await passwordCard.passwordLine.updateComplete;
  ok(
    passwordCard.passwordLine.revealBtn.hidden,
    "Reveal button should be hidden"
  );

  SidebarController.hide();
});
