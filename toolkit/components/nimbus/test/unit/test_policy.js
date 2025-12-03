/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

const { EnterprisePolicyTesting } = ChromeUtils.importESModule(
  "resource://testing-common/EnterprisePolicyTesting.sys.mjs"
);

const RECIPES = [
  NimbusTestUtils.factories.recipe.withFeatureConfig("experiment", {
    featureId: "no-feature-firefox-desktop",
  }),
  NimbusTestUtils.factories.recipe.withFeatureConfig(
    "rollout",
    { featureId: "no-feature-firefox-desktop" },
    { isRollout: true }
  ),
  NimbusTestUtils.factories.recipe.withFeatureConfig(
    "optin",
    { featureId: "no-feature-firefox-desktop" },
    {
      isRollout: true,
      isFirefoxLabsOptIn: true,
      firefoxLabsTitle: "title",
      firefoxLabsDescription: "description",
      firefoxLabsGroup: "group",
      requiresRestart: false,
    }
  ),
];

add_setup(function setup() {
  // Instantiate the enterprise policy service.
  void Cc["@mozilla.org/enterprisepolicies;1"].getService(Ci.nsIObserver);
});

async function doTest({
  policies,
  labsEnabled,
  studiesEnabled,
  existingEnrollments = [],
  expectedEnrollments,
  expectedOptIns,
}) {
  info("Enabling policy");
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({ policies });

  info("Is policy engine active?");
  Assert.equal(
    Services.policies.status,
    Ci.nsIEnterprisePolicies.ACTIVE,
    "Policy engine is active"
  );

  let storePath = undefined;
  if (existingEnrollments) {
    const store = NimbusTestUtils.stubs.store();
    await store.init();

    for (const slug of existingEnrollments) {
      NimbusTestUtils.addEnrollmentForRecipe(
        RECIPES.find(e => e.slug === slug),
        { store }
      );
    }

    storePath = await NimbusTestUtils.saveStore(store);
  }

  const { initExperimentAPI, cleanup, loader } =
    await NimbusTestUtils.setupTest({
      init: false,
      experiments: RECIPES,
      storePath,
    });

  sinon.spy(loader, "updateRecipes");
  sinon.spy(loader, "setTimer");

  await initExperimentAPI();

  Assert.equal(
    ExperimentAPI.studiesEnabled,
    studiesEnabled,
    "Studies are enabled"
  );
  Assert.equal(
    ExperimentAPI.labsEnabled,
    labsEnabled,
    "FirefoxLabs is enabled"
  );

  Assert.equal(
    loader._enabled,
    studiesEnabled || labsEnabled,
    "RemoteSettingsExperimentLoader initialized"
  );

  Assert.equal(
    loader.setTimer.called,
    studiesEnabled || labsEnabled,
    "RemoteSettingsExperimentLoader polling for recipes"
  );

  Assert.equal(
    loader.updateRecipes.called,
    studiesEnabled || labsEnabled,
    "RemoteSettingsExperimentLoader polling for recipes"
  );

  Assert.deepEqual(
    ExperimentAPI.manager.store
      .getAll()
      .filter(e => e.active)
      .map(e => e.slug)
      .sort(),
    expectedEnrollments.sort(),
    "Should have expected enrollments"
  );

  Assert.deepEqual(
    ExperimentAPI.manager.optInRecipes.map(e => e.slug).sort(),
    expectedOptIns,
    "Should have expected available opt-ins"
  );

  await NimbusTestUtils.cleanupManager(expectedEnrollments);
  await cleanup();
}

add_task(async function testDisableStudiesPolicy() {
  await doTest({
    policies: { DisableFirefoxStudies: true },
    labsEnabled: true,
    studiesEnabled: false,
    expectedEnrollments: [],
    expectedOptIns: ["optin"],
  });
});

add_task(async function testDisableLabsPolicy() {
  await doTest({
    policies: { UserMessaging: { FirefoxLabs: false } },
    labsEnabled: false,
    studiesEnabled: true,
    expectedEnrollments: ["experiment", "rollout"],
    expectedOptIns: [],
  });
});

add_task(async function testNimbusDisabled() {
  await doTest({
    policies: {
      DisableFirefoxStudies: true,
      UserMessaging: { FirefoxLabs: false },
    },
    labsEnabled: false,
    studiesEnabled: false,
    expectedEnrollments: [],
    expectedOptIns: [],
  });
});

add_task(async function testDisableLabsPolicyCausesUnenrollments() {
  await doTest({
    policies: { UserMessaging: { FirefoxLabs: false } },
    labsEnabled: false,
    studiesEnabled: true,
    expectedEnrollments: ["experiment", "rollout"],
    existingEnrollments: ["optin"],
    expectedOptIns: [],
  });
});
