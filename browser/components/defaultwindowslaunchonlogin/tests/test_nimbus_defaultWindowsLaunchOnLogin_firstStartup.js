/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

/* import-globals-from ../../../../testing/xpcshell/head.js */

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { FirstStartup } = ChromeUtils.importESModule(
  "resource://gre/modules/FirstStartup.sys.mjs"
);
const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const {
  DefaultWindowsLaunchOnLogin,
  DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_NIMBUS_FEATURE_ID,
  DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF,
} = ChromeUtils.importESModule(
  "resource:///modules/DefaultWindowsLaunchOnLogin.sys.mjs"
);
const { ExperimentAPI, NimbusFeatures } = ChromeUtils.importESModule(
  "resource://nimbus/ExperimentAPI.sys.mjs"
);
const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);
const { updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);
const { MockRegistry } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistry.sys.mjs"
);

const PREF_CATEGORY_TASKS = "first-startup.category-tasks-enabled";
const CATEGORY_NAME = "first-startup-new-profile";

NimbusTestUtils.init(this);

let registry = null;
add_setup(async () => {
  // FOG needs a profile
  do_get_profile();

  registry = new MockRegistry();

  // It's expected that these keys exist
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

  Services.fog.initializeFOG();
  Services.fog.testResetFOG();
  updateAppInfo();

  // Delete any other first-startup-new-profile entries
  // that have been registered statically so that we're
  // just running the one here under test.
  for (let { entry } of Services.catMan.enumerateCategory(CATEGORY_NAME)) {
    if (entry != "resource:///modules/DefaultWindowsLaunchOnLogin.sys.mjs") {
      Services.catMan.deleteCategoryEntry(CATEGORY_NAME, entry, false);
    }
  }

  const { cleanup: nimbusTestCleanup } = await NimbusTestUtils.setupTest();

  registerCleanupFunction(() => {
    nimbusTestCleanup();
    registry.shutdown();
  });
});

add_task(async function test_is_applyExperimentOverride_registered() {
  const entry = Services.catMan.getCategoryEntry(
    CATEGORY_NAME,
    "resource:///modules/DefaultWindowsLaunchOnLogin.sys.mjs"
  );
  Assert.ok(
    entry,
    "An entry should exist for resource:///modules/DefaultWindowsLaunchOnLogin.sys.mjs"
  );
  Assert.equal(
    entry,
    "DefaultWindowsLaunchOnLogin.applyExperimentOverride",
    "Entry value should point to the `applyExperimentOverride` method"
  );
});

// Test that the defaultEnabled pref is set to true when Nimbus says
// enabled: true
add_task(
  {
    skip_if: () =>
      !AppConstants.MOZ_NORMANDY || AppConstants.platform !== "win",
  },
  async function test_defaultWindowsLaunchOnLogin_remote_enable() {
    NimbusTestUtils.cleanupStorePrefCache();

    // Enable category tasks for first startup
    Services.prefs.setBoolPref(PREF_CATEGORY_TASKS, true);
    Services.prefs.clearUserPref(DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF);
    FirstStartup.resetForTesting();

    const firstStartupFeatureCleanup =
      await NimbusTestUtils.enrollWithFeatureConfig(
        {
          featureId: DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_NIMBUS_FEATURE_ID,
          value: { enabled: true },
        },
        { isRollout: true }
      );

    // Track whether applyExperimentOverride was called
    let sandbox = sinon.createSandbox();
    let applyExperimentOverrideSpy = sandbox.spy(
      DefaultWindowsLaunchOnLogin,
      "applyExperimentOverride"
    );

    let submissionPromise = new Promise(resolve => {
      GleanPings.firstStartup.testBeforeNextSubmit(() => {
        Assert.equal(FirstStartup.state, FirstStartup.SUCCESS);
        resolve();
      });
    });

    // Run FirstStartup which should trigger out category hook
    FirstStartup.init(true /* newProfile */);

    await submissionPromise;

    Assert.ok(
      applyExperimentOverrideSpy.calledOnce,
      "applyExperimentOverride should have been called"
    );

    Assert.equal(
      Services.prefs.getBoolPref(DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF, false),
      true,
      "defaultEnabled pref should be true when Nimbus says enabled"
    );

    sandbox.restore();
    await firstStartupFeatureCleanup();
    Services.prefs.clearUserPref(PREF_CATEGORY_TASKS);
    Services.prefs.clearUserPref(DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF);
  }
);

// Check that the defaultEnabled pref is flipped to false when Nimbus says
// enabled: false.
add_task(
  {
    skip_if: () =>
      !AppConstants.MOZ_NORMANDY || AppConstants.platform !== "win",
  },
  async function test_defaultWindowsLaunchOnLogin_remote_disable() {
    NimbusTestUtils.cleanupStorePrefCache();

    // Enable category tasks for first startup
    Services.prefs.setBoolPref(PREF_CATEGORY_TASKS, true);
    Services.prefs.clearUserPref(DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF);
    FirstStartup.resetForTesting();

    const firstStartupFeatureCleanup =
      await NimbusTestUtils.enrollWithFeatureConfig(
        {
          featureId: DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_NIMBUS_FEATURE_ID,
          value: { enabled: false },
        },
        { isRollout: true }
      );

    // Track whether applyExperimentOverride was called
    let sandbox = sinon.createSandbox();
    let applyExperimentOverrideSpy = sandbox.spy(
      DefaultWindowsLaunchOnLogin,
      "applyExperimentOverride"
    );

    let submissionPromise = new Promise(resolve => {
      GleanPings.firstStartup.testBeforeNextSubmit(() => {
        Assert.equal(FirstStartup.state, FirstStartup.SUCCESS);
        resolve();
      });
    });

    // Run FirstStartup which should trigger out category hook
    FirstStartup.init(true /* newProfile */);

    await submissionPromise;

    Assert.ok(
      applyExperimentOverrideSpy.calledOnce,
      "applyExperimentOverride should have been called"
    );

    Assert.equal(
      Services.prefs.getBoolPref(DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF, true),
      false,
      "defaultEnabled pref should be flipped to false when Nimbus says disabled"
    );

    sandbox.restore();
    await firstStartupFeatureCleanup();
    Services.prefs.clearUserPref(PREF_CATEGORY_TASKS);
    Services.prefs.clearUserPref(DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF);
  }
);

// Verify the bidirectional case: when the pref ships default-disabled,
// Nimbus enabled: true should still flip the pref to true.
add_task(
  {
    skip_if: () =>
      !AppConstants.MOZ_NORMANDY || AppConstants.platform !== "win",
  },
  async function test_defaultWindowsLaunchOnLogin_overrides_default_false() {
    NimbusTestUtils.cleanupStorePrefCache();

    Services.prefs.setBoolPref(PREF_CATEGORY_TASKS, true);
    Services.prefs.clearUserPref(DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF);

    // Temporarily flip the default branch to false to simulate a build that
    // ships with the feature default-off.
    let defaultBranch = Services.prefs.getDefaultBranch("");
    let originalDefault = defaultBranch.getBoolPref(
      DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF,
      true
    );
    defaultBranch.setBoolPref(DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF, false);

    FirstStartup.resetForTesting();

    const firstStartupFeatureCleanup =
      await NimbusTestUtils.enrollWithFeatureConfig(
        {
          featureId: DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_NIMBUS_FEATURE_ID,
          value: { enabled: true },
        },
        { isRollout: true }
      );

    let submissionPromise = new Promise(resolve => {
      GleanPings.firstStartup.testBeforeNextSubmit(() => {
        Assert.equal(FirstStartup.state, FirstStartup.SUCCESS);
        resolve();
      });
    });

    FirstStartup.init(true /* newProfile */);

    await submissionPromise;

    Assert.equal(
      Services.prefs.getBoolPref(DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF, false),
      true,
      "defaultEnabled pref should be flipped to true when Nimbus says enabled, even if the shipped default is false"
    );

    await firstStartupFeatureCleanup();
    defaultBranch.setBoolPref(
      DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF,
      originalDefault
    );
    Services.prefs.clearUserPref(PREF_CATEGORY_TASKS);
    Services.prefs.clearUserPref(DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF);
  }
);
