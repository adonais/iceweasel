"use strict";

const { Sampling } = ChromeUtils.importESModule(
  "resource://gre/modules/components-utils/Sampling.sys.mjs"
);

const { MatchStatus } = ChromeUtils.importESModule(
  "resource://nimbus/lib/RemoteSettingsExperimentLoader.sys.mjs"
);

const { NimbusTelemetry } = ChromeUtils.importESModule(
  "resource://nimbus/lib/Telemetry.sys.mjs"
);
const { UnenrollmentCause } = ChromeUtils.importESModule(
  "resource://nimbus/lib/ExperimentManager.sys.mjs"
);

const { ProfilesDatastoreService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfilesDatastoreService.sys.mjs"
);

/**
 * onStartup()
 * - should set call setExperimentActive for each active experiment
 */
add_task(async function test_onStartup_setExperimentActive_called() {
  const { sandbox, manager, cleanup } = await NimbusTestUtils.setupTest({
    init: false,
    storePath: await NimbusTestUtils.createStoreWith(store => {
      NimbusTestUtils.addEnrollmentForRecipe(
        NimbusTestUtils.factories.recipe("foo"),
        { store, branchSlug: "control" }
      );
      NimbusTestUtils.addEnrollmentForRecipe(
        NimbusTestUtils.factories.recipe("bar", { isRollout: true }),
        { store }
      );
      NimbusTestUtils.addEnrollmentForRecipe(
        NimbusTestUtils.factories.recipe("baz"),
        { store, branchSlug: "control", extra: { active: false } }
      );
      NimbusTestUtils.addEnrollmentForRecipe(
        NimbusTestUtils.factories.recipe("qux", { isRollout: true }),
        { store, extra: { active: false } }
      );
    }),
    migrationState: NimbusTestUtils.migrationState.LATEST,
  });

  sandbox.stub(NimbusTelemetry, "setExperimentActive");

  await ExperimentAPI.init();

  Assert.ok(
    NimbusTelemetry.setExperimentActive.calledWith(sinon.match({ slug: "foo" }))
  );
  Assert.ok(
    NimbusTelemetry.setExperimentActive.calledWith(sinon.match({ slug: "bar" }))
  );
  Assert.ok(
    !NimbusTelemetry.setExperimentActive.calledWith(
      sinon.match({ slug: "baz" })
    )
  );
  Assert.ok(
    !NimbusTelemetry.setExperimentActive.calledWith(
      sinon.match({ slug: "qux" })
    )
  );

  manager.unenroll("foo");
  manager.unenroll("bar");

  await cleanup();
});

add_task(async function test_startup_unenroll() {
  Services.prefs.setBoolPref("app.shield.optoutstudies.enabled", false);

  const { sandbox, manager, cleanup } = await NimbusTestUtils.setupTest({
    init: false,
    storePath: await NimbusTestUtils.createStoreWith(store => {
      NimbusTestUtils.addEnrollmentForRecipe(
        NimbusTestUtils.factories.recipe("startup_unenroll"),
        { store, branchSlug: "control" }
      );
    }),
    migrationState: NimbusTestUtils.migrationState.UNMIGRATED,
  });

  sandbox.spy(manager, "_unenroll");

  await ExperimentAPI.init();

  Assert.ok(
    manager._unenroll.calledOnceWith(
      sinon.match({ slug: "startup_unenroll" }),
      {
        reason: "studies-opt-out",
      }
    ),
    "Called unenroll for expected recipe"
  );

  Services.prefs.clearUserPref("app.shield.optoutstudies.enabled");

  await cleanup();
});

add_task(async function test_onRecipe_enroll() {
  const { sandbox, manager, cleanup } = await NimbusTestUtils.setupTest();

  sandbox.stub(manager, "isInBucketAllocation").resolves(true);
  sandbox.stub(Sampling, "bucketSample").resolves(true);
  sandbox.spy(manager, "enroll");
  sandbox.spy(manager, "updateEnrollment");

  const recipe = NimbusTestUtils.factories.recipe("foo");

  Assert.deepEqual(
    manager.store.getAllActiveExperiments(),
    [],
    "There should be no active experiments"
  );

  await manager.onRecipe(recipe, "test", {
    ok: true,
    status: MatchStatus.TARGETING_AND_BUCKETING,
  });

  Assert.equal(
    manager.enroll.calledWith(recipe),
    true,
    "should call .enroll() the first time a recipe is seen"
  );
  Assert.equal(
    manager.store.has("foo"),
    true,
    "should add recipe to the store"
  );

  manager.unenroll(recipe.slug);

  await cleanup();
});

add_task(async function test_onRecipe_update() {
  const { sandbox, manager, cleanup } = await NimbusTestUtils.setupTest();

  sandbox.spy(manager, "enroll");
  sandbox.spy(manager, "updateEnrollment");

  const recipe = NimbusTestUtils.factories.recipe("foo");

  await manager.store.init();
  await manager.onStartup();
  await manager.enroll(recipe, "test");
  await manager.onRecipe(recipe, "test", {
    ok: true,
    status: MatchStatus.TARGETING_AND_BUCKETING,
  });

  Assert.equal(
    manager.updateEnrollment.calledWith(
      sinon.match({ slug: recipe.slug }),
      recipe,
      "test",
      {
        ok: true,
        status: MatchStatus.TARGETING_AND_BUCKETING,
      }
    ),
    true,
    "should call .updateEnrollment() if the recipe has already been enrolled"
  );

  manager.unenroll(recipe.slug);

  await cleanup();
});

add_task(async function test_onRecipe_rollout_update() {
  const { sandbox, manager, cleanup } = await NimbusTestUtils.setupTest();

  sandbox.spy(manager, "enroll");
  sandbox.spy(manager, "_unenroll");
  sandbox.spy(manager, "updateEnrollment");

  const recipe = NimbusTestUtils.factories.recipe("foo", { isRollout: true });

  await manager.enroll(recipe, "test");
  await manager.onRecipe(recipe, "test", {
    ok: true,
    status: MatchStatus.TARGETING_AND_BUCKETING,
  });

  Assert.ok(
    manager.updateEnrollment.calledOnceWith(
      sinon.match({ slug: recipe.slug }),
      recipe,
      "test",
      { ok: true, status: MatchStatus.TARGETING_AND_BUCKETING }
    ),
    "should call .updateEnrollment() if the recipe has already been enrolled"
  );
  Assert.ok(
    manager.updateEnrollment.alwaysReturned(Promise.resolve(true)),
    "updateEnrollment will confirm the enrolled branch still exists in the recipe and exit"
  );
  Assert.ok(
    manager._unenroll.notCalled,
    "Should not call if the branches did not change"
  );

  manager.updateEnrollment.resetHistory();

  const updatedRecipe = NimbusTestUtils.factories.recipe(recipe.slug, {
    isRollout: true,
    branches: [
      {
        ...recipe.branches[0],
        slug: "control-v2",
      },
    ],
  });
  await manager.onRecipe(updatedRecipe, "test", {
    ok: true,
    status: MatchStatus.TARGETING_AND_BUCKETING,
  });

  Assert.ok(
    manager.updateEnrollment.calledOnceWith(
      sinon.match({ slug: recipe.slug }),
      updatedRecipe,
      "test",
      { ok: true, status: MatchStatus.TARGETING_AND_BUCKETING }
    ),
    "should call .updateEnrollment() if the recipe has already been enrolled"
  );
  Assert.ok(
    manager._unenroll.calledOnceWith(sinon.match({ slug: recipe.slug }), {
      reason: "branch-removed",
    }),
    "updateEnrollment will unenroll because the branch slug changed"
  );

  await cleanup();
});

add_task(async function test_onRecipe_isFirefoxLabsOptin_recipe() {
  const { sandbox, manager, cleanup } = await NimbusTestUtils.setupTest();

  sandbox.stub(manager, "enroll");

  const optInRecipe = NimbusTestUtils.factories.recipe("opt-in", {
    isFirefoxLabsOptIn: true,
    isRollout: true,
  });
  const recipe = NimbusTestUtils.factories.recipe("recipe");

  await manager.onRecipe(optInRecipe, "test", {
    ok: true,
    status: MatchStatus.TARGETING_AND_BUCKETING,
  });
  await manager.onRecipe(recipe, "test", {
    ok: true,
    status: MatchStatus.TARGETING_AND_BUCKETING,
  });

  Assert.equal(
    manager.optInRecipes.length,
    1,
    "should only have one opt-in recipe"
  );
  Assert.equal(
    manager.optInRecipes[0],
    optInRecipe,
    "should add the recipe to OptInRecipes list if recipe is firefox labs opt-in"
  );
  Assert.equal(
    manager.enroll.calledOnceWith(recipe, "test"),
    true,
    "should try to enroll the fxLabsOptOutRecipe since it is a targetting match"
  );

  await cleanup();
});

add_task(async function test_context_paramters() {
  const { manager, cleanup } = await NimbusTestUtils.setupTest();

  const experiment = NimbusTestUtils.factories.recipe("experiment");
  const rollout = NimbusTestUtils.factories.recipe("rollout", {
    isRollout: true,
  });

  let targetingCtx = manager.createTargetingContext();

  Assert.deepEqual(await targetingCtx.activeExperiments, []);
  Assert.deepEqual(await targetingCtx.activeRollouts, []);
  Assert.deepEqual(await targetingCtx.previousExperiments, []);
  Assert.deepEqual(await targetingCtx.previousRollouts, []);
  Assert.deepEqual(await targetingCtx.enrollments, []);

  await manager.enroll(experiment, "test");
  await manager.enroll(rollout, "test");

  targetingCtx = manager.createTargetingContext();
  Assert.deepEqual(await targetingCtx.activeExperiments, ["experiment"]);
  Assert.deepEqual(await targetingCtx.activeRollouts, ["rollout"]);
  Assert.deepEqual(await targetingCtx.previousExperiments, []);
  Assert.deepEqual(await targetingCtx.previousRollouts, []);
  Assert.deepEqual([...(await targetingCtx.enrollments)].sort(), [
    "experiment",
    "rollout",
  ]);

  manager.unenroll(experiment.slug);
  manager.unenroll(rollout.slug);

  targetingCtx = manager.createTargetingContext();
  Assert.deepEqual(await targetingCtx.activeExperiments, []);
  Assert.deepEqual(await targetingCtx.activeRollouts, []);
  Assert.deepEqual(await targetingCtx.previousExperiments, ["experiment"]);
  Assert.deepEqual(await targetingCtx.previousRollouts, ["rollout"]);
  Assert.deepEqual([...(await targetingCtx.enrollments)].sort(), [
    "experiment",
    "rollout",
  ]);

  await cleanup();
});

add_task(async function test_experimentStore_updateEvent() {
  const { sandbox, manager, cleanup } = await NimbusTestUtils.setupTest();
  const stub = sandbox.stub();

  manager.store.on("update", stub);

  await manager.enroll(
    NimbusTestUtils.factories.recipe("experiment"),
    "rs-loader"
  );
  Assert.ok(
    stub.calledOnceWith("update", { slug: "experiment", active: true })
  );
  stub.resetHistory();

  manager.unenroll(
    "experiment",
    UnenrollmentCause.fromReason(
      NimbusTelemetry.UnenrollReason.INDIVIDUAL_OPT_OUT
    )
  );
  Assert.ok(
    stub.calledOnceWith("update", {
      slug: "experiment",
      active: false,
      unenrollReason: "individual-opt-out",
    })
  );

  await cleanup();
});

add_task(async function testDb() {
  const conn = await ProfilesDatastoreService.getConnection();

  async function getEnrollmentSlugs() {
    const result = await conn.execute(
      `
      SELECT
        slug
      FROM NimbusEnrollments
      WHERE
        profileId = :profileId;
    `,
      { profileId: ExperimentAPI.profileId }
    );

    return result.map(row => row.getResultByName("slug")).sort();
  }

  const { manager, cleanup } = await NimbusTestUtils.setupTest();

  const experimentRecipe = NimbusTestUtils.factories.recipe("experiment", {
    branches: [
      {
        ratio: 1,
        slug: "control",
        features: [
          {
            featureId: "no-feature-firefox-desktop",
            value: {},
          },
        ],
      },
      {
        ratio: 0, // Force enrollment in control
        slug: "treatment",
        features: [
          {
            featureId: "no-feature-firefox-desktop",
            value: {},
          },
        ],
      },
    ],
  });

  const rolloutRecipe = NimbusTestUtils.factories.recipe.withFeatureConfig(
    "rollout",
    { branchSlug: "rollout", featureId: "no-feature-firefox-desktop" }
  );

  Assert.deepEqual(
    await getEnrollmentSlugs(),
    [],
    "There are no database entries"
  );

  // Enroll in an experiment
  await manager.enroll(experimentRecipe, "test");
  await NimbusTestUtils.flushStore();
  Assert.deepEqual(
    await getEnrollmentSlugs(),
    [experimentRecipe.slug],
    "There is one enrollment"
  );

  let experimentEnrollment = await NimbusTestUtils.queryEnrollment(
    experimentRecipe.slug
  );
  Assert.notEqual(
    experimentEnrollment,
    null,
    "experiment enrollment should exist"
  );
  Assert.ok(experimentEnrollment.active, "experiment enrollment is active");
  Assert.deepEqual(
    experimentEnrollment.recipe,
    experimentRecipe,
    "experiment enrollment has the correct recipe"
  );
  Assert.equal(
    experimentEnrollment.branchSlug,
    manager.store.get(experimentRecipe.slug).branch.slug,
    "experiment branch slug matches"
  );

  // Enroll in a rollout.
  await manager.enroll(rolloutRecipe, "test");
  await NimbusTestUtils.flushStore();
  Assert.deepEqual(
    await getEnrollmentSlugs(),
    [experimentRecipe.slug, rolloutRecipe.slug].sort(),
    "There are two enrollments"
  );

  let rolloutEnrollment = await NimbusTestUtils.queryEnrollment(
    rolloutRecipe.slug
  );
  Assert.notEqual(rolloutEnrollment, null, "rollout enrollment exists");
  Assert.ok(rolloutEnrollment.active, "rollout enrollment is active");
  Assert.deepEqual(
    rolloutEnrollment.recipe,
    rolloutRecipe,
    "rollout enrollment has the correct recipe"
  );
  Assert.equal(
    rolloutEnrollment.branchSlug,
    manager.store.get(rolloutRecipe.slug).branch.slug,
    "rollout branch slug matches"
  );

  // Unenroll from the rollout.
  manager.unenroll(rolloutRecipe.slug, { reason: "recipe-not-seen" });
  await NimbusTestUtils.flushStore();
  Assert.deepEqual(
    await getEnrollmentSlugs(),
    [experimentRecipe.slug, rolloutRecipe.slug].sort(),
    "There are two enrollments"
  );

  rolloutEnrollment = await NimbusTestUtils.queryEnrollment(rolloutRecipe.slug);
  Assert.notEqual(rolloutEnrollment, null, "rollout enrollment exists");
  Assert.ok(!rolloutEnrollment.active, "rollout enrollment is inactive");
  Assert.equal(
    rolloutEnrollment.unenrollReason,
    "recipe-not-seen",
    "rollout unenrollReason"
  );
  Assert.equal(
    rolloutEnrollment.branchSlug,
    manager.store.get(rolloutRecipe.slug).branch.slug,
    "rollout branch slug matches"
  );

  // Unenroll from the experiment.
  manager.unenroll(experimentEnrollment.slug, { reason: "targeting" });
  await NimbusTestUtils.flushStore();

  experimentEnrollment = await NimbusTestUtils.queryEnrollment(
    experimentRecipe.slug
  );
  Assert.notEqual(
    experimentEnrollment,
    null,
    "experiment enrollment still exists"
  );
  Assert.ok(!experimentEnrollment.active, "experiment enrollment is inactive");
  Assert.equal(
    experimentEnrollment.unenrollReason,
    "targeting",
    "experiment unenrollReason"
  );
  Assert.equal(
    experimentEnrollment.branchSlug,
    manager.store.get(experimentRecipe.slug).branch.slug,
    "experiment branch slug matches"
  );

  await cleanup();
});

add_task(async function testForceEnrollMultifeature() {
  const { manager, cleanup } = await NimbusTestUtils.setupTest({
    features: [
      new ExperimentFeature("test-feature-1", { variables: {} }),
      new ExperimentFeature("test-feature-2", { variables: {} }),
    ],
  });

  await manager.enroll(
    NimbusTestUtils.factories.recipe("recipe-1", {
      branches: [
        {
          slug: "control",
          ratio: 1,
          features: [
            {
              featureId: "test-feature-1",
              value: {},
            },
            {
              featureId: "test-feature-2",
              value: {},
            },
          ],
        },
      ],
    }),
    "test"
  );

  Assert.ok(
    manager.store.get("recipe-1")?.active,
    "Enrollment in recipe-1 is active"
  );

  const recipe = NimbusTestUtils.factories.recipe("recipe-2", {
    branches: [
      {
        slug: "control",
        ratio: 1,
        features: [
          {
            featureId: "test-feature-1",
            value: {},
          },
          {
            featureId: "test-feature-2",
            value: {},
          },
        ],
      },
    ],
  });

  const result = manager.canEnroll(recipe);
  Assert.ok(!result.ok);
  Assert.equal(result.reason, "enrolled-in-feature");
  Assert.deepEqual(Array.from(result.conflictingEnrollments), ["recipe-1"]);

  await manager.forceEnroll(recipe, "control");

  Assert.ok(
    !manager.store.get("recipe-1").active,
    "Enrollment in recipe-1 is inactive"
  );
  Assert.ok(
    manager.store.get("optin-recipe-2")?.active,
    "Enrollment in recipe-2 is active"
  );

  manager.unenroll("optin-recipe-2", "test");

  await cleanup();
});

// `ExperimentAPI.init()` is now called by multiple consumers. If a second
// caller arrives while the first is still doing init work, the second caller's
// `await init()` shouldn't resolve until the first caller's work has
// actually completed. See Bug 2042553
add_task(async function test_concurrent_init_callers_await_real_completion() {
  const { sandbox, loader, cleanup } = await NimbusTestUtils.setupTest({
    init: false,
  });

  // Gate _rsLoader.enable() so the first init() can be held in flight
  const enableGate = Promise.withResolvers();
  const realEnable = loader.enable.bind(loader);
  sandbox.stub(loader, "enable").callsFake(async (...args) => {
    await enableGate.promise;
    return realEnable(...args);
  });

  // Kick off both callers without awaiting, and capture loader state at the
  // moment the second call resolves
  const p1 = ExperimentAPI.init();
  let hasUpdatedOnceWhenP2Resolved = null;
  const p2 = ExperimentAPI.init().then(result => {
    hasUpdatedOnceWhenP2Resolved = loader._hasUpdatedOnce;
    return result;
  });

  // Unblock init now that both callers are pending
  enableGate.resolve();

  const [result1, result2] = await Promise.all([p1, p2]);

  Assert.strictEqual(result1, true, "First caller returned true");
  Assert.strictEqual(
    result2,
    false,
    "Second caller returned false (init was already in flight)"
  );
  Assert.strictEqual(
    hasUpdatedOnceWhenP2Resolved,
    true,
    "Second init() did not resolve until the RS loader had actually finished updating"
  );

  // A subsequent call after completion still returns false
  const result3 = await ExperimentAPI.init();
  Assert.strictEqual(
    result3,
    false,
    "Post-completion caller returned false (init already done)"
  );

  await cleanup();
});
