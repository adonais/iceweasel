/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { TelemetryEnvironment } = ChromeUtils.importESModule(
  "resource://gre/modules/TelemetryEnvironment.sys.mjs"
);
const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);
const { SearchTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/SearchTestUtils.sys.mjs"
);
const { TelemetryEnvironmentTesting } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryEnvironmentTesting.sys.mjs"
);

add_setup(async function setup() {
  TelemetryEnvironmentTesting.registerFakeSysInfo();
  TelemetryEnvironmentTesting.spoofGfxAdapter();
  do_get_profile();

  // We need to ensure FOG is initialized, otherwise we will panic trying to get test values.
  Services.fog.initializeFOG();

  await loadAddonManager(APP_ID, APP_NAME, APP_VERSION, PLATFORM_VERSION);

  TelemetryEnvironmentTesting.init(gAppInfo);

  // The test runs in a fresh profile so starting the AddonManager causes
  // the addons database to be created (as does setting new theme).
  // For test_addonsStartup below, we want to test a "warm" startup where
  // there is already a database on disk.  Simulate that here by just
  // restarting the AddonManager.
  await AddonTestUtils.promiseShutdownManager();
  await AddonTestUtils.overrideBuiltIns({ builtins: [] });
  AddonTestUtils.addonStartup.remove(true);
  await AddonTestUtils.promiseStartupManager();

  // Create the attribution data file, so that settings.attribution will exist.
  // The attribution functionality only exists in Firefox.
  if (AppConstants.MOZ_BUILD_APP == "browser") {
    TelemetryEnvironmentTesting.spoofAttributionData();
    registerCleanupFunction(async function () {
      await TelemetryEnvironmentTesting.cleanupAttributionData;
    });
  }
  await TelemetryEnvironmentTesting.spoofProfileReset();
  await TelemetryEnvironment.delayedInit();
  // The environment needs the search service initialised, so use a dummy
  // configuration.
  await SearchTestUtils.setRemoteSettingsConfig([{ identifier: "unused" }]);
});

add_task(async function test_checkEnvironment() {
  let data = TelemetryEnvironment.currentEnvironment;

  // Check that settings.intl is lazily loaded.
  Assert.equal(
    typeof data.settings.intl,
    "object",
    "intl is initially an object"
  );
  Assert.equal(
    Object.keys(data.settings.intl).length,
    0,
    "intl is initially empty"
  );

  // Now continue with startup.
  let initPromise = TelemetryEnvironment.onInitialized();
  finishAddonManagerStartup();

  // Fake the delayed startup event for intl data to load.
  fakeIntlReady();

  let environmentData = await initPromise;
  TelemetryEnvironmentTesting.checkEnvironmentData(environmentData, {
    isInitial: true,
  });

  TelemetryEnvironmentTesting.spoofPartnerInfo();
  Services.obs.notifyObservers(null, DISTRIBUTION_CUSTOMIZATION_COMPLETE_TOPIC);

  environmentData = TelemetryEnvironment.currentEnvironment;
  TelemetryEnvironmentTesting.checkEnvironmentData(environmentData, {
    assertProcessData: true,
  });
});

add_task(async function test_prefWatchPolicies() {
  const PREF_TEST_1 = "toolkit.telemetry.test.pref_new";
  const PREF_TEST_2 = "toolkit.telemetry.test.pref1";
  const PREF_TEST_3 = "toolkit.telemetry.test.pref2";
  const PREF_TEST_4 = "toolkit.telemetry.test.pref_old";
  const PREF_TEST_5 = "toolkit.telemetry.test.requiresRestart";

  const expectedValue = "some-test-value";
  const unexpectedValue = "unexpected-test-value";

  const PREFS_TO_WATCH = new Map([
    [PREF_TEST_1, { what: TelemetryEnvironment.RECORD_PREF_VALUE }],
    [PREF_TEST_2, { what: TelemetryEnvironment.RECORD_PREF_STATE }],
    [PREF_TEST_3, { what: TelemetryEnvironment.RECORD_PREF_STATE }],
    [PREF_TEST_4, { what: TelemetryEnvironment.RECORD_PREF_VALUE }],
    [
      PREF_TEST_5,
      { what: TelemetryEnvironment.RECORD_PREF_VALUE, requiresRestart: true },
    ],
  ]);

  Services.prefs.setStringPref(PREF_TEST_4, expectedValue);
  Services.prefs.setStringPref(PREF_TEST_5, expectedValue);

  // Set the Environment preferences to watch.
  await TelemetryEnvironment.testWatchPreferences(PREFS_TO_WATCH);
  let deferred = Promise.withResolvers();

  // Check that the pref values are missing or present as expected
  Assert.strictEqual(
    TelemetryEnvironment.currentEnvironment.settings.userPrefs[PREF_TEST_1],
    undefined
  );
  Assert.strictEqual(
    TelemetryEnvironment.currentEnvironment.settings.userPrefs[PREF_TEST_4],
    expectedValue
  );
  Assert.strictEqual(
    TelemetryEnvironment.currentEnvironment.settings.userPrefs[PREF_TEST_5],
    expectedValue
  );

  TelemetryEnvironment.registerChangeListener(
    "testWatchPrefs",
    (reason, data) => deferred.resolve(data)
  );
  let oldEnvironmentData = TelemetryEnvironment.currentEnvironment;

  // Trigger a change in the watched preferences.
  Services.prefs.setStringPref(PREF_TEST_1, expectedValue);
  Services.prefs.setBoolPref(PREF_TEST_2, false);
  Services.prefs.setStringPref(PREF_TEST_5, unexpectedValue);
  let eventEnvironmentData = await deferred.promise;

  // Unregister the listener.
  TelemetryEnvironment.unregisterChangeListener("testWatchPrefs");

  // Check environment contains the correct data.
  Assert.deepEqual(oldEnvironmentData, eventEnvironmentData);
  let userPrefs = TelemetryEnvironment.currentEnvironment.settings.userPrefs;

  Assert.equal(
    userPrefs[PREF_TEST_1],
    expectedValue,
    "Environment contains the correct preference value."
  );
  Assert.equal(
    userPrefs[PREF_TEST_2],
    "<user-set>",
    "Report that the pref was user set but the value is not shown."
  );
  Assert.ok(
    !(PREF_TEST_3 in userPrefs),
    "Do not report if preference not user set."
  );
  Assert.equal(
    userPrefs[PREF_TEST_5],
    expectedValue,
    "The pref value in the environment data should still be the same"
  );
});

add_task(async function test_prefWatch_prefReset() {
  const PREF_TEST = "toolkit.telemetry.test.pref1";
  const PREFS_TO_WATCH = new Map([
    [PREF_TEST, { what: TelemetryEnvironment.RECORD_PREF_STATE }],
  ]);

  // Set the preference to a non-default value.
  Services.prefs.setBoolPref(PREF_TEST, false);

  // Set the Environment preferences to watch.
  await TelemetryEnvironment.testWatchPreferences(PREFS_TO_WATCH);
  let deferred = Promise.withResolvers();
  TelemetryEnvironment.registerChangeListener(
    "testWatchPrefs_reset",
    deferred.resolve
  );

  Assert.strictEqual(
    TelemetryEnvironment.currentEnvironment.settings.userPrefs[PREF_TEST],
    "<user-set>"
  );

  // Trigger a change in the watched preferences.
  Services.prefs.clearUserPref(PREF_TEST);
  await deferred.promise;

  Assert.strictEqual(
    TelemetryEnvironment.currentEnvironment.settings.userPrefs[PREF_TEST],
    undefined
  );

  // Unregister the listener.
  TelemetryEnvironment.unregisterChangeListener("testWatchPrefs_reset");
});

add_task(async function test_prefDefault() {
  const PREF_TEST = "toolkit.telemetry.test.defaultpref1";
  const expectedValue = "some-test-value";

  const PREFS_TO_WATCH = new Map([
    [PREF_TEST, { what: TelemetryEnvironment.RECORD_DEFAULTPREF_VALUE }],
  ]);

  // Set the preference to a default value.
  Services.prefs.getDefaultBranch(null).setCharPref(PREF_TEST, expectedValue);

  // Set the Environment preferences to watch.
  // We're not watching, but this function does the setup we need.
  await TelemetryEnvironment.testWatchPreferences(PREFS_TO_WATCH);

  Assert.strictEqual(
    TelemetryEnvironment.currentEnvironment.settings.userPrefs[PREF_TEST],
    expectedValue
  );
});

add_task(async function test_prefDefaultState() {
  const PREF_TEST = "toolkit.telemetry.test.defaultpref2";
  const expectedValue = "some-test-value";

  const PREFS_TO_WATCH = new Map([
    [PREF_TEST, { what: TelemetryEnvironment.RECORD_DEFAULTPREF_STATE }],
  ]);

  await TelemetryEnvironment.testWatchPreferences(PREFS_TO_WATCH);

  Assert.equal(
    PREF_TEST in TelemetryEnvironment.currentEnvironment.settings.userPrefs,
    false
  );

  // Set the preference to a default value.
  Services.prefs.getDefaultBranch(null).setCharPref(PREF_TEST, expectedValue);

  Assert.strictEqual(
    TelemetryEnvironment.currentEnvironment.settings.userPrefs[PREF_TEST],
    "<set>"
  );
});

add_task(async function test_prefInvalid() {
  const PREF_TEST_1 = "toolkit.telemetry.test.invalid1";
  const PREF_TEST_2 = "toolkit.telemetry.test.invalid2";

  const PREFS_TO_WATCH = new Map([
    [PREF_TEST_1, { what: TelemetryEnvironment.RECORD_DEFAULTPREF_VALUE }],
    [PREF_TEST_2, { what: TelemetryEnvironment.RECORD_DEFAULTPREF_STATE }],
  ]);

  await TelemetryEnvironment.testWatchPreferences(PREFS_TO_WATCH);

  Assert.strictEqual(
    TelemetryEnvironment.currentEnvironment.settings.userPrefs[PREF_TEST_1],
    undefined
  );
  Assert.strictEqual(
    TelemetryEnvironment.currentEnvironment.settings.userPrefs[PREF_TEST_2],
    undefined
  );
});

add_task(
  { skip_if: () => AppConstants.MOZ_APP_NAME == "thunderbird" },
  async function test_delayed_defaultBrowser() {
    // Skip this test on Thunderbird since it is not a browser, so it cannot
    // be the default browser.

    // Make sure we don't have anything already cached for this test.
    await TelemetryEnvironment.testCleanRestart().onInitialized();

    let environmentData = TelemetryEnvironment.currentEnvironment;
    TelemetryEnvironmentTesting.checkEnvironmentData(environmentData);
    Assert.equal(
      environmentData.settings.isDefaultBrowser,
      null,
      "isDefaultBrowser must be null before the session is restored."
    );

    Services.obs.notifyObservers(null, "sessionstore-windows-restored");
    // Session restore triggers search service init asynchronously.
    // If this completes during shutdown, it throws an exception.
    // Await the search service init to make this deterministic (bug 1885310).
    await SearchService.promiseInitialized;

    environmentData = TelemetryEnvironment.currentEnvironment;
    TelemetryEnvironmentTesting.checkEnvironmentData(environmentData);
    Assert.ok(
      "isDefaultBrowser" in environmentData.settings,
      "isDefaultBrowser must be available after the session is restored."
    );
    Assert.equal(
      typeof environmentData.settings.isDefaultBrowser,
      "boolean",
      "isDefaultBrowser must be of the right type."
    );

    // Make sure pref-flipping doesn't overwrite the browser default state.
    const PREF_TEST = "toolkit.telemetry.test.pref1";
    const PREFS_TO_WATCH = new Map([
      [PREF_TEST, { what: TelemetryEnvironment.RECORD_PREF_STATE }],
    ]);
    Services.prefs.clearUserPref(PREF_TEST);

    // Watch the test preference.
    await TelemetryEnvironment.testWatchPreferences(PREFS_TO_WATCH);
    let deferred = Promise.withResolvers();
    TelemetryEnvironment.registerChangeListener(
      "testDefaultBrowser_pref",
      deferred.resolve
    );
    // Trigger an environment change.
    Services.prefs.setIntPref(PREF_TEST, 1);
    await deferred.promise;
    TelemetryEnvironment.unregisterChangeListener("testDefaultBrowser_pref");

    // Check that the data is still available.
    environmentData = TelemetryEnvironment.currentEnvironment;
    TelemetryEnvironmentTesting.checkEnvironmentData(environmentData);
    Assert.ok(
      "isDefaultBrowser" in environmentData.settings,
      "isDefaultBrowser must still be available after a pref is flipped."
    );
  }
);

add_task(async function test_osstrings() {
  // First test that numbers in sysinfo properties are converted to string fields
  // in system.os.
  TelemetryEnvironmentTesting.setSysInfoOverrides({
    version: 1,
    name: 2,
    kernel_version: 3,
  });

  await TelemetryEnvironment.testCleanRestart().onInitialized();
  let data = TelemetryEnvironment.currentEnvironment;
  TelemetryEnvironmentTesting.checkEnvironmentData(data);

  Assert.equal(data.system.os.version, "1");
  Assert.equal(data.system.os.name, "2");
  if (AppConstants.platform == "android") {
    Assert.equal(data.system.os.kernelVersion, "3");
  }

  // Check that null values are also handled.
  TelemetryEnvironmentTesting.setSysInfoOverrides({
    version: null,
    name: null,
    kernel_version: null,
  });

  await TelemetryEnvironment.testCleanRestart().onInitialized();
  data = TelemetryEnvironment.currentEnvironment;
  TelemetryEnvironmentTesting.checkEnvironmentData(data);

  Assert.equal(data.system.os.version, null);
  Assert.equal(data.system.os.name, null);
  if (AppConstants.platform == "android") {
    Assert.equal(data.system.os.kernelVersion, null);
  }

  // Clean up.
  TelemetryEnvironmentTesting.setSysInfoOverrides({});
  await TelemetryEnvironment.testCleanRestart().onInitialized();
});

add_task(async function test_experimentsAPI() {
  const EXPERIMENT1 = "experiment-1";
  const EXPERIMENT1_BRANCH = "nice-branch";
  const EXPERIMENT2 = "experiment-2";
  const EXPERIMENT2_BRANCH = "other-branch";

  let checkExperiment = (environmentData, id, branch) => {
    Assert.ok(
      "experiments" in environmentData,
      "The current environment must report the experiment annotations."
    );
    Assert.ok(
      id in environmentData.experiments,
      "The experiments section must contain the expected experiment id."
    );
    Assert.equal(
      environmentData.experiments[id].branch,
      branch,
      "The experiment branch must be correct."
    );
  };

  // Clean the environment and check that it's reporting the correct info.
  await TelemetryEnvironment.testCleanRestart().onInitialized();
  let data = TelemetryEnvironment.currentEnvironment;
  TelemetryEnvironmentTesting.checkEnvironmentData(data);

  // We don't expect the experiments section to be there if no annotation
  // happened.
  Assert.ok(
    !("experiments" in data),
    "No experiments section must be reported if nothing was annotated."
  );

  // Add a change listener and add an experiment annotation.
  let deferred = Promise.withResolvers();
  TelemetryEnvironment.registerChangeListener(
    "test_experimentsAPI",
    (reason, env) => {
      deferred.resolve(env);
    }
  );
  TelemetryEnvironment.setExperimentActive(EXPERIMENT1, EXPERIMENT1_BRANCH);
  let eventEnvironmentData = await deferred.promise;

  // Check that the old environment does not contain the experiments.
  TelemetryEnvironmentTesting.checkEnvironmentData(eventEnvironmentData);
  Assert.ok(
    !("experiments" in eventEnvironmentData),
    "No experiments section must be reported in the old environment."
  );

  // Check that the current environment contains the right experiment.
  data = TelemetryEnvironment.currentEnvironment;
  TelemetryEnvironmentTesting.checkEnvironmentData(data);
  checkExperiment(data, EXPERIMENT1, EXPERIMENT1_BRANCH);

  TelemetryEnvironment.unregisterChangeListener("test_experimentsAPI");

  // Add a second annotation and check that both experiments are there.
  deferred = Promise.withResolvers();
  TelemetryEnvironment.registerChangeListener(
    "test_experimentsAPI2",
    (reason, env) => {
      deferred.resolve(env);
    }
  );
  TelemetryEnvironment.setExperimentActive(EXPERIMENT2, EXPERIMENT2_BRANCH);
  eventEnvironmentData = await deferred.promise;

  // Check that the current environment contains both the experiment.
  data = TelemetryEnvironment.currentEnvironment;
  TelemetryEnvironmentTesting.checkEnvironmentData(data);
  checkExperiment(data, EXPERIMENT1, EXPERIMENT1_BRANCH);
  checkExperiment(data, EXPERIMENT2, EXPERIMENT2_BRANCH);

  // The previous environment should only contain the first experiment.
  checkExperiment(eventEnvironmentData, EXPERIMENT1, EXPERIMENT1_BRANCH);
  Assert.ok(
    !(EXPERIMENT2 in eventEnvironmentData),
    "The old environment must not contain the new experiment annotation."
  );

  TelemetryEnvironment.unregisterChangeListener("test_experimentsAPI2");

  // Check that removing an unknown experiment annotation does not trigger
  // a notification.
  TelemetryEnvironment.registerChangeListener("test_experimentsAPI3", () => {
    Assert.ok(
      false,
      "Removing an unknown experiment annotation must not trigger a change."
    );
  });
  TelemetryEnvironment.setExperimentInactive("unknown-experiment-id");
  // Also make sure that passing non-string parameters arguments doesn't throw nor
  // trigger a notification.
  TelemetryEnvironment.setExperimentActive({}, "some-branch");
  TelemetryEnvironment.setExperimentActive("some-id", {});
  TelemetryEnvironment.unregisterChangeListener("test_experimentsAPI3");

  // Check that removing a known experiment leaves the other in place and triggers
  // a change.
  deferred = Promise.withResolvers();
  TelemetryEnvironment.registerChangeListener(
    "test_experimentsAPI4",
    (reason, env) => {
      deferred.resolve(env);
    }
  );
  TelemetryEnvironment.setExperimentInactive(EXPERIMENT1);
  eventEnvironmentData = await deferred.promise;

  // Check that the current environment contains just the second experiment.
  data = TelemetryEnvironment.currentEnvironment;
  TelemetryEnvironmentTesting.checkEnvironmentData(data);
  Assert.ok(
    !(EXPERIMENT1 in data),
    "The current environment must not contain the removed experiment annotation."
  );
  checkExperiment(data, EXPERIMENT2, EXPERIMENT2_BRANCH);

  // The previous environment should contain both annotations.
  checkExperiment(eventEnvironmentData, EXPERIMENT1, EXPERIMENT1_BRANCH);
  checkExperiment(eventEnvironmentData, EXPERIMENT2, EXPERIMENT2_BRANCH);

  // Set an experiment with a type and check that it correctly shows up.
  TelemetryEnvironment.setExperimentActive(
    "typed-experiment",
    "random-branch",
    { type: "ab-test" }
  );
  data = TelemetryEnvironment.currentEnvironment;
  checkExperiment(data, "typed-experiment", "random-branch", "ab-test");
});

add_task(async function test_experimentsAPI_limits() {
  const EXPERIMENT =
    "experiment-2-experiment-2-experiment-2-experiment-2-experiment-2" +
    "-experiment-2-experiment-2-experiment-2-experiment-2";
  const EXPERIMENT_BRANCH =
    "other-branch-other-branch-other-branch-other-branch-other" +
    "-branch-other-branch-other-branch-other-branch-other-branch";
  const EXPERIMENT_TRUNCATED = EXPERIMENT.substring(0, 100);
  const EXPERIMENT_BRANCH_TRUNCATED = EXPERIMENT_BRANCH.substring(0, 100);

  // Clean the environment and check that it's reporting the correct info.
  await TelemetryEnvironment.testCleanRestart().onInitialized();
  let data = TelemetryEnvironment.currentEnvironment;
  TelemetryEnvironmentTesting.checkEnvironmentData(data);

  // We don't expect the experiments section to be there if no annotation
  // happened.
  Assert.ok(
    !("experiments" in data),
    "No experiments section must be reported if nothing was annotated."
  );

  // Add a change listener and wait for the annotation to happen.
  let deferred = Promise.withResolvers();
  TelemetryEnvironment.registerChangeListener("test_experimentsAPI", () =>
    deferred.resolve()
  );
  TelemetryEnvironment.setExperimentActive(EXPERIMENT, EXPERIMENT_BRANCH);
  await deferred.promise;

  // Check that the current environment contains the truncated values
  // for the experiment data.
  data = TelemetryEnvironment.currentEnvironment;
  TelemetryEnvironmentTesting.checkEnvironmentData(data);
  Assert.ok(
    "experiments" in data,
    "The environment must contain an experiments section."
  );
  Assert.ok(
    EXPERIMENT_TRUNCATED in data.experiments,
    "The experiments must be reporting the truncated id."
  );
  Assert.ok(
    !(EXPERIMENT in data.experiments),
    "The experiments must not be reporting the full id."
  );
  Assert.equal(
    EXPERIMENT_BRANCH_TRUNCATED,
    data.experiments[EXPERIMENT_TRUNCATED].branch,
    "The experiments must be reporting the truncated branch."
  );

  TelemetryEnvironment.unregisterChangeListener("test_experimentsAPI");

  // Check that an overly long type is truncated.
  const longType = "a0123456678901234567890123456789";
  TelemetryEnvironment.setExperimentActive("exp", "some-branch", {
    type: longType,
  });
  data = TelemetryEnvironment.currentEnvironment;
  Assert.equal(data.experiments.exp.type, longType.substring(0, 20));
});

if (gIsWindows) {
  add_task(async function test_environmentHDDInfo() {
    await TelemetryEnvironment.testCleanRestart().onInitialized();
    let data = TelemetryEnvironment.currentEnvironment;
    let empty = { model: null, revision: null, type: null };
    Assert.deepEqual(
      data.system.hdd,
      { binary: empty, profile: empty, system: empty },
      "Should have no data yet."
    );
    await TelemetryEnvironment.delayedInit();
    data = TelemetryEnvironment.currentEnvironment;
    for (let k of TelemetryEnvironmentTesting.EXPECTED_HDD_FIELDS) {
      TelemetryEnvironmentTesting.checkString(data.system.hdd[k].model);
      TelemetryEnvironmentTesting.checkString(data.system.hdd[k].revision);
      TelemetryEnvironmentTesting.checkString(data.system.hdd[k].type);
    }
  });

  add_task(async function test_environmentProcessInfo() {
    await TelemetryEnvironment.testCleanRestart().onInitialized();
    let data = TelemetryEnvironment.currentEnvironment;
    Assert.deepEqual(data.system.isWow64, null, "Should have no data yet.");
    await TelemetryEnvironment.delayedInit();
    data = TelemetryEnvironment.currentEnvironment;
    Assert.equal(
      typeof data.system.isWow64,
      "boolean",
      "isWow64 must be a boolean."
    );
    Assert.equal(
      typeof data.system.isWowARM64,
      "boolean",
      "isWowARM64 must be a boolean."
    );
    Assert.equal(
      typeof data.system.hasWinPackageId,
      "boolean",
      "hasWinPackageId must be a boolean."
    );
    // This is only sent for Mozilla produced MSIX packages
    Assert.ok(
      !("winPackageFamilyName" in data.system) ||
        data.system.winPackageFamilyName === null ||
        typeof data.system.winPackageFamilyName === "string",
      "winPackageFamilyName must be a string if non null"
    );
    // These should be numbers if they are not null
    for (let f of [
      "count",
      "model",
      "family",
      "stepping",
      "l2cacheKB",
      "l3cacheKB",
      "speedMHz",
      "cores",
    ]) {
      Assert.ok(
        !(f in data.system.cpu) ||
          data.system.cpu[f] === null ||
          Number.isFinite(data.system.cpu[f]),
        f + " must be a number if non null."
      );
    }
    Assert.ok(
      TelemetryEnvironmentTesting.checkString(data.system.cpu.vendor),
      "vendor must be a valid string."
    );
  });

  add_task(async function test_environmentOSInfo() {
    await TelemetryEnvironment.testCleanRestart().onInitialized();
    let data = TelemetryEnvironment.currentEnvironment;
    Assert.deepEqual(
      data.system.os.installYear,
      null,
      "Should have no data yet."
    );
    await TelemetryEnvironment.delayedInit();
    data = TelemetryEnvironment.currentEnvironment;
    Assert.ok(
      Number.isFinite(data.system.os.installYear),
      "Install year must be a number."
    );
  });
}

add_task(
  { skip_if: () => AppConstants.MOZ_APP_NAME == "thunderbird" },
  async function test_environmentServicesInfo() {
    let cache = TelemetryEnvironment.testCleanRestart();
    await cache.onInitialized();
    let oldGetFxaSignedInUser = cache._getFxaSignedInUser;
    try {
      // Test the 'yes to both' case.

      // This makes the weave service return that the usere is definitely a sync user
      Services.prefs.setStringPref(
        "services.sync.username",
        "c00lperson123@example.com"
      );
      let calledFxa = false;
      cache._getFxaSignedInUser = () => {
        calledFxa = true;
        return null;
      };

      await cache._updateServicesInfo();
      ok(
        !calledFxa,
        "Shouldn't need to ask FxA if they're definitely signed in"
      );
      deepEqual(cache.currentEnvironment.services, {
        accountEnabled: true,
        syncEnabled: true,
      });

      // Test the fxa-but-not-sync case.
      Services.prefs.clearUserPref("services.sync.username");
      // We don't actually inspect the returned object, just t
      cache._getFxaSignedInUser = async () => {
        return {};
      };
      await cache._updateServicesInfo();
      deepEqual(cache.currentEnvironment.services, {
        accountEnabled: true,
        syncEnabled: false,
      });
      // Test the "no to both" case.
      cache._getFxaSignedInUser = async () => {
        return null;
      };
      await cache._updateServicesInfo();
      deepEqual(cache.currentEnvironment.services, {
        accountEnabled: false,
        syncEnabled: false,
      });
      // And finally, the 'fxa is in an error state' case.
      cache._getFxaSignedInUser = () => {
        throw new Error("You'll never know");
      };
      await cache._updateServicesInfo();
      equal(cache.currentEnvironment.services, null);
    } finally {
      cache._getFxaSignedInUser = oldGetFxaSignedInUser;
      Services.prefs.clearUserPref("services.sync.username");
    }
  }
);

add_task(async function test_environmentShutdown() {
  // Define and reset the test preference.
  const PREF_TEST = "toolkit.telemetry.test.pref1";
  const PREFS_TO_WATCH = new Map([
    [PREF_TEST, { what: TelemetryEnvironment.RECORD_PREF_STATE }],
  ]);
  Services.prefs.clearUserPref(PREF_TEST);

  // Set up the preferences and listener, then the trigger shutdown
  await TelemetryEnvironment.testWatchPreferences(PREFS_TO_WATCH);
  TelemetryEnvironment.registerChangeListener(
    "test_environmentShutdownChange",
    () => {
      // Register a new change listener that asserts if change is propogated
      Assert.ok(false, "No change should be propagated after shutdown.");
    }
  );
  TelemetryEnvironment.shutdown();

  // Flipping  the test preference after shutdown should not trigger the listener
  Services.prefs.setIntPref(PREF_TEST, 1);

  // Unregister the listener.
  TelemetryEnvironment.unregisterChangeListener(
    "test_environmentShutdownChange"
  );
});

add_task(async function test_environmentDidntChange() {
  // Clean the environment and check that it's reporting the correct info.
  await TelemetryEnvironment.testCleanRestart().onInitialized();
  let data = TelemetryEnvironment.currentEnvironment;
  TelemetryEnvironmentTesting.checkEnvironmentData(data);

  const LISTENER_NAME = "test_environmentDidntChange";
  TelemetryEnvironment.registerChangeListener(LISTENER_NAME, () => {
    Assert.ok(false, "The environment didn't actually change.");
  });

  // Don't actually change the environment, but notify of a compositor abort.
  const COMPOSITOR_ABORTED_TOPIC = "compositor:process-aborted";
  Services.obs.notifyObservers(null, COMPOSITOR_ABORTED_TOPIC);

  TelemetryEnvironment.unregisterChangeListener(LISTENER_NAME);
});

add_task(async function test_addonInstall_stillTriggersEnvironmentChange() {
  // environment.addons no longer exists, but installing an addon must
  // still trigger an "addons-changed" environment change notification, so
  // that "environment-change" reason main pings keep firing at the same
  // frequency as before addons were dropped from the environment.
  const ADDON_ID = "tel-addons-changed-notify@tests.mozilla.org";

  const LISTENER_NAME = "test_addonInstall_stillTriggersEnvironmentChange";
  let deferred = Promise.withResolvers();
  TelemetryEnvironment.registerChangeListener(LISTENER_NAME, reason => {
    if (reason == "addons-changed") {
      deferred.resolve();
    }
  });

  let xpi = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      browser_specific_settings: { gecko: { id: ADDON_ID } },
    },
  });
  let { addon } = await AddonTestUtils.promiseInstallFile(xpi);

  await deferred.promise;
  TelemetryEnvironment.unregisterChangeListener(LISTENER_NAME);

  await addon.startupPromise;
  await addon.uninstall();
});
