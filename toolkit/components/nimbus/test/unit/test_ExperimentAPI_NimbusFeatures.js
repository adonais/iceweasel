"use strict";

ChromeUtils.defineLazyGetter(this, "fetchSchema", () => {
  return fetch(
    "resource://testing-common/nimbus/schemas/NimbusEnrollment.schema.json",
    {
      credentials: "omit",
    }
  ).then(rsp => rsp.json());
});

const MATCHING_ROLLOUT_RECIPE = NimbusTestUtils.factories.recipe(
  "matching-rollout",
  {
    branches: [
      {
        slug: "slug",
        ratio: 1,
        features: [
          {
            featureId: "aboutwelcome",
            value: { enabled: false },
          },
        ],
      },
    ],
    isRollout: true,
  }
);

const AW_FAKE_MANIFEST = {
  description: "Different manifest with a special test variable",
  isEarlyStartup: true,
  variables: {
    remoteValue: {
      type: "boolean",
      description: "Test value",
    },
    mochitest: {
      type: "boolean",
    },
    enabled: {
      type: "boolean",
    },
  },
};

const TEST_FEATURE = new ExperimentFeature("test-feature", {
  description: "Test feature",
  isEarlyStartup: false,
  hasExposure: false,
  variables: {
    enabled: {
      type: "boolean",
      description: "test variable",
    },
  },
});

add_setup(() => {
  NimbusTestUtils.addTestFeatures(TEST_FEATURE);
});

add_task(async function readyCallAfterStore_with_remote_value() {
  const { manager, cleanup } = await NimbusTestUtils.setupTest();
  const feature = new ExperimentFeature("aboutwelcome");

  Assert.ok(feature.getVariable("enabled"), "Feature is true by default");

  await manager.enroll(MATCHING_ROLLOUT_RECIPE, "test");

  Assert.ok(!feature.getVariable("enabled"), "Loads value from store");

  manager.unenroll(MATCHING_ROLLOUT_RECIPE.slug);

  await cleanup();
});

add_task(async function has_sync_value_before_ready() {
  // We don't need to initialize Nimbus in this test.
  const { cleanup } = await NimbusTestUtils.setupTest({ init: false });
  const feature = new ExperimentFeature("aboutwelcome", AW_FAKE_MANIFEST);

  Assert.equal(
    feature.getVariable("remoteValue"),
    undefined,
    "value undefined by default"
  );

  const enrollment = NimbusTestUtils.factories.enrollment(
    MATCHING_ROLLOUT_RECIPE
  );

  Services.prefs.setStringPref(
    "nimbus.syncdefaultsstore.aboutwelcome",
    JSON.stringify({
      ...enrollment,
      branch: { feature: enrollment.branch.features[0] },
    })
  );

  Services.prefs.setBoolPref(
    "nimbus.syncdefaultsstore.aboutwelcome.remoteValue",
    true
  );

  Assert.equal(feature.getVariable("remoteValue"), true, "Sync load from pref");

  Services.prefs.clearUserPref("nimbus.syncdefaultsstore.aboutwelcome");
  Services.prefs.clearUserPref(
    "nimbus.syncdefaultsstore.aboutwelcome.remoteValue"
  );

  await cleanup();
});

add_task(async function update_remote_defaults_onUpdate() {
  const { sandbox, manager, cleanup } = await NimbusTestUtils.setupTest();
  const feature = new ExperimentFeature("aboutwelcome");
  const stub = sandbox.stub();

  feature.onUpdate(stub);

  await manager.enroll(MATCHING_ROLLOUT_RECIPE, "test");

  Assert.ok(stub.called, "update event called");
  Assert.equal(stub.callCount, 1, "Called once for remote configs");
  Assert.equal(stub.firstCall.args[1], "rollout-updated", "Correct reason");

  manager.unenroll(MATCHING_ROLLOUT_RECIPE.slug);

  await cleanup();
});

add_task(async function update_remote_defaults_readyPromise() {
  const { sandbox, manager, cleanup } = await NimbusTestUtils.setupTest();
  const feature = new ExperimentFeature("aboutwelcome");
  const stub = sandbox.stub();

  feature.onUpdate(stub);

  await manager.enroll(MATCHING_ROLLOUT_RECIPE, "test");

  Assert.ok(stub.calledOnce, "Update called after enrollment processed.");
  Assert.ok(
    stub.calledWith("featureUpdate:aboutwelcome", "rollout-updated"),
    "Update called after enrollment processed."
  );

  manager.unenroll(MATCHING_ROLLOUT_RECIPE.slug);

  await cleanup();
});

add_task(async function update_remote_defaults_enabled() {
  const { manager, cleanup } = await NimbusTestUtils.setupTest();
  const feature = new ExperimentFeature("aboutwelcome");

  Assert.equal(
    feature.getVariable("enabled"),
    true,
    "Feature is enabled by manifest.variables.enabled"
  );

  await manager.enroll(MATCHING_ROLLOUT_RECIPE, "test");

  Assert.ok(
    !feature.getVariable("enabled"),
    "Feature is disabled by remote configuration"
  );

  manager.unenroll(MATCHING_ROLLOUT_RECIPE.slug);
  await cleanup();
});

// If the branch data returned from the store is not modified
// this test should not throw
add_task(async function test_getVariable_no_mutation() {
  const { sandbox, manager, cleanup } = await NimbusTestUtils.setupTest();
  sandbox.stub(manager.store, "getExperimentForFeature").returns(
    Cu.cloneInto(
      {
        branch: {
          features: [{ featureId: "aboutwelcome", value: { mochitest: true } }],
        },
      },
      {},
      { deepFreeze: true }
    )
  );
  const feature = new ExperimentFeature("aboutwelcome", AW_FAKE_MANIFEST);

  Assert.ok(feature.getVariable("mochitest"), "Got back the expected feature");

  await cleanup();
});
