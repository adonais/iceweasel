/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  BackgroundUpdate: "resource://gre/modules/BackgroundUpdate.sys.mjs",
  MigrationUtils: "resource:///modules/MigrationUtils.sys.mjs",
  PermissionTestUtils: "resource://testing-common/PermissionTestUtils.sys.mjs",
  TestUtils: "resource://testing-common/TestUtils.sys.mjs",
  WindowsLaunchOnLogin: "resource://gre/modules/WindowsLaunchOnLogin.sys.mjs",
});

add_task(async function test_check_uncheck_checkbox() {
  await ExperimentAPI.ready();
  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "windowsLaunchOnLogin",
    value: { enabled: true },
  });
  // Open preferences to general pane
  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;

  let launchOnLoginCheckbox = doc.getElementById("windowsLaunchOnLogin");

  // Launch-on-login is enabled by default for new installs,
  // so on a fresh profile the checkbox starts checked and the
  // startup task is already enabled.
  ok(
    launchOnLoginCheckbox.checked,
    "Autostart checkbox starts checked (default-enabled for new installs)"
  );
  ok(
    await WindowsLaunchOnLogin.getLaunchOnLoginEnabled(),
    "Launch on login is enabled at startup"
  );

  // Click once: should disable launch-on-login.
  launchOnLoginCheckbox.click();
  ok(
    !launchOnLoginCheckbox.checked,
    "Autostart checkbox unchecked after first click"
  );
  await TestUtils.waitForCondition(async () => {
    return !(await WindowsLaunchOnLogin.getLaunchOnLoginEnabled());
  }, "Launch on login is disabled after unchecking");

  // Click again: should re-enable launch-on-login.
  launchOnLoginCheckbox.click();
  ok(
    launchOnLoginCheckbox.checked,
    "Autostart checkbox re-checked after second click"
  );
  await TestUtils.waitForCondition(async () => {
    return await WindowsLaunchOnLogin.getLaunchOnLoginEnabled();
  }, "Launch on login is re-enabled after rechecking");

  gBrowser.removeCurrentTab();
  await doCleanup();
});

add_task(async function enable_external_startuptask() {
  await ExperimentAPI.ready();
  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "windowsLaunchOnLogin",
    value: { enabled: true },
  });
  // Ensure the task is disabled before enabling it
  await WindowsLaunchOnLogin._disableLaunchOnLoginMSIX();
  let enabled = await WindowsLaunchOnLogin.enableLaunchOnLoginMSIX();
  ok(enabled, "Task is enabled");

  // Open preferences to general pane
  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;

  let launchOnLoginCheckbox = doc.getElementById("windowsLaunchOnLogin");
  ok(launchOnLoginCheckbox.checked, "Autostart checkbox automatically checked");

  gBrowser.removeCurrentTab();
  await doCleanup();
});

add_task(async function disable_external_startuptask() {
  await ExperimentAPI.ready();
  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "windowsLaunchOnLogin",
    value: { enabled: true },
  });
  // Disable the startup task to ensure it's reflected in the settings
  await WindowsLaunchOnLogin._disableLaunchOnLoginMSIX();

  // Open preferences to general pane
  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;

  let launchOnLoginCheckbox = doc.getElementById("windowsLaunchOnLogin");
  ok(
    !launchOnLoginCheckbox.checked,
    "Launch on login checkbox automatically unchecked"
  );

  gBrowser.removeCurrentTab();
  await doCleanup();
});
