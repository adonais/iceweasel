/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  WindowsLaunchOnLogin: "resource://gre/modules/WindowsLaunchOnLogin.sys.mjs",
});

const { MockRegistry } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistry.sys.mjs"
);

const ENABLED_PREF = "browser.startup.windowsLaunchOnLogin.enabled";
const isMSIX = Services.sysinfo.getProperty("hasWinPackageId");

let registry = null;

add_setup(async function () {
  registry = new MockRegistry();
  registry.setValue(
    Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER,
    "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
    "",
    ""
  );
  registry.setValue(
    Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER,
    "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run",
    "",
    ""
  );
  registerCleanupFunction(async () => {
    registry.shutdown();
    await setupPolicyEngineWithJson("");
  });
});

async function hasRegistryKey() {
  let exists = false;
  await WindowsLaunchOnLogin.withLaunchOnLoginRegistryKey(wrk => {
    exists = wrk.hasValue(WindowsLaunchOnLogin.getLaunchOnLoginRegistryName());
  });
  return exists;
}

add_task(async function test_disable_launch_on_login() {
  // Simulate the user having previously enabled launch on login.
  if (!isMSIX) {
    await WindowsLaunchOnLogin.createLaunchOnLogin();
    ok(await hasRegistryKey(), "Registry key exists before the policy applies");
  }

  await setupPolicyEngineWithJson({
    policies: {
      DisableLaunchOnLogin: true,
    },
  });

  is(
    Services.prefs.getBoolPref(ENABLED_PREF),
    false,
    "Launch on login enabled pref is forced to false"
  );
  ok(Services.prefs.prefIsLocked(ENABLED_PREF), "Enabled pref is locked");

  if (!isMSIX) {
    await TestUtils.waitForCondition(
      async () => !(await hasRegistryKey()),
      "Waiting for the launch on login registry key to be removed"
    );

    await WindowsLaunchOnLogin.createLaunchOnLogin();
    ok(
      !(await hasRegistryKey()),
      "createLaunchOnLogin is blocked while the policy is active"
    );
  }

  await BrowserTestUtils.withNewTab("about:preferences", async browser => {
    let doc = browser.contentDocument;
    await TestUtils.waitForCondition(
      () => doc.getElementById("windowsLaunchOnLogin"),
      "windowsLaunchOnLogin checkbox rendered"
    );
    ok(
      doc.getElementById("windowsLaunchOnLogin").parentElement.hidden,
      "Checkbox is hidden by policy"
    );
  });
});

add_task(async function test_policy_false_is_noop() {
  await setupPolicyEngineWithJson({
    policies: {
      DisableLaunchOnLogin: false,
    },
  });

  ok(
    !Services.prefs.prefIsLocked(ENABLED_PREF),
    "Enabled pref is not locked when the policy is false"
  );
});
