/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The set-default controls only render when the browser is capable of
// checking its default state, which is the case for test runs.
async function checkSetDefaultUI({ isHidden }) {
  await BrowserTestUtils.withNewTab(
    "about:preferences#general",
    async browser => {
      let doc = browser.contentDocument;
      let pane;
      await TestUtils.waitForCondition(() => {
        pane = doc.getElementById("isNotDefaultPane");
        return pane?.control;
      }, "Waiting for the default browser pane to render");

      await TestUtils.waitForCondition(
        () => BrowserTestUtils.isHidden(pane.control) === isHidden,
        `Waiting for the set-default pane to be ${
          isHidden ? "hidden" : "visible"
        }`
      );
      is(
        BrowserTestUtils.isHidden(pane.control),
        isHidden,
        `The set-default browser pane should be ${
          isHidden ? "hidden" : "visible"
        }`
      );
    }
  );
}

add_task(async function test_default_browser_setting_enabled() {
  // Without the policy the set-default controls are shown.
  await checkSetDefaultUI({ isHidden: false });
});

add_task(async function test_default_browser_setting_disabled() {
  await setupPolicyEngineWithJson({
    policies: {
      DefaultBrowserSettingEnabled: false,
    },
  });

  ok(
    !Services.policies.isAllowed("setDefaultBrowser"),
    "Setting the default browser is not allowed"
  );
  await checkSetDefaultUI({ isHidden: true });
});

add_task(async function test_set_default_browser_blocked_by_policy() {
  const { sinon } = ChromeUtils.importESModule(
    "resource://testing-common/Sinon.sys.mjs"
  );
  const sandbox = sinon.createSandbox();
  // Stubbed so a regression in the guard cannot change the real system default.
  const userChoiceStub = sandbox
    .stub(ShellService, "setAsDefaultUserChoice")
    .resolves();
  const setDefaultStub = sinon.stub();
  sandbox
    .stub(ShellService, "shellService")
    .value({ setDefaultBrowser: setDefaultStub });

  await setupPolicyEngineWithJson({
    policies: {
      DefaultBrowserSettingEnabled: false,
    },
  });

  await ShellService.setDefaultBrowser(false);

  Assert.ok(userChoiceStub.notCalled, "UserChoice method not called");
  Assert.ok(setDefaultStub.notCalled, "Fallback method not called");

  sandbox.restore();
});
