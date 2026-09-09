/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { StartupTelemetry } = ChromeUtils.importESModule(
  "moz-src:///browser/components/StartupTelemetry.sys.mjs"
);

let LaunchOnLogin;

({ LaunchOnLogin } = ChromeUtils.importESModule(
  "resource://gre/modules/LaunchOnLogin.sys.mjs"
));

add_setup(function test_setup() {
  do_get_profile();
  Services.fog.initializeFOG();
});

add_task(async function test_not_supported_on_non_windows() {
  if (LaunchOnLogin.isSupported()) {
    return;
  }
  Services.fog.testResetFOG();

  await StartupTelemetry.launchOnLoginState();

  Assert.equal(
    Glean.osEnvironment.launchOnLoginState.testGetValue(),
    "not_supported",
    "Should report not_supported on non-Windows platforms"
  );
});

add_task(async function test_enabled() {
  if (!LaunchOnLogin.isSupported()) {
    return;
  }
  Services.fog.testResetFOG();

  let original = LaunchOnLogin.enablementDetails;
  LaunchOnLogin.enablementDetails = async () => ({
    isEnabled: true,
    isSupported: true,
    isAllowedByPolicy: true,
  });

  await StartupTelemetry.launchOnLoginState();

  Assert.equal(
    Glean.osEnvironment.launchOnLoginState.testGetValue(),
    "enabled",
    "Should report enabled when launch on login is active"
  );
  LaunchOnLogin.enablementDetails = original;
});

add_task(async function test_disabled() {
  if (!LaunchOnLogin.isSupported()) {
    return;
  }
  Services.fog.testResetFOG();

  let original = LaunchOnLogin.enablementDetails;
  LaunchOnLogin.enablementDetails = async () => ({
    isEnabled: false,
    isSupported: true,
    isAllowedByPolicy: true,
  });

  await StartupTelemetry.launchOnLoginState();

  Assert.equal(
    Glean.osEnvironment.launchOnLoginState.testGetValue(),
    "disabled",
    "Should report disabled when user has not enabled launch on login"
  );
  LaunchOnLogin.enablementDetails = original;
});

add_task(async function test_disabled_by_settings() {
  if (!LaunchOnLogin.isSupported()) {
    return;
  }
  Services.fog.testResetFOG();

  let original = LaunchOnLogin.enablementDetails;
  LaunchOnLogin.enablementDetails = async () => ({
    isEnabled: false,
    isSupported: true,
    isAllowedByPolicy: false,
  });

  await StartupTelemetry.launchOnLoginState();

  Assert.equal(
    Glean.osEnvironment.launchOnLoginState.testGetValue(),
    "disabled_by_settings",
    "Should report disabled_by_settings when OS settings or policy block the feature"
  );
  LaunchOnLogin.enablementDetails = original;
});

add_task(async function test_error_on_exception() {
  if (!LaunchOnLogin.isSupported()) {
    return;
  }
  Services.fog.testResetFOG();

  let original = LaunchOnLogin.enablementDetails;
  LaunchOnLogin.enablementDetails = async () => {
    throw new Error("simulated enablement details failure");
  };

  await StartupTelemetry.launchOnLoginState();

  Assert.equal(
    Glean.osEnvironment.launchOnLoginState.testGetValue(),
    "error",
    "Should report error when an exception occurs"
  );
  LaunchOnLogin.enablementDetails = original;
});
