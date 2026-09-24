"use strict";

const { FirstStartup } = ChromeUtils.importESModule(
  "resource://gre/modules/FirstStartup.sys.mjs"
);

function setupFirstStartup(state) {
  const originalState = FirstStartup._state;

  FirstStartup._state = state;

  return {
    [Symbol.dispose]() {
      FirstStartup._state = originalState;
    },
  };
}

add_task(async function testCreateTargetingContext() {
  const { cleanup, manager } = await NimbusTestUtils.setupTest();

  const experiment = NimbusTestUtils.factories.recipe.withFeatureConfig("foo", {
    branchSlug: "bar",
    featureId: "no-feature-firefox-desktop",
  });
  const rollout = NimbusTestUtils.factories.recipe.withFeatureConfig(
    "baz",
    { branchSlug: "qux", featureId: "no-feature-firefox-desktop" },
    { isRollout: true }
  );

  await manager.enroll(experiment, "test");
  await manager.enroll(rollout, "test");

  let context = manager.createTargetingContext();
  const activeSlugs = await context.activeExperiments;
  const activeRollouts = await context.activeRollouts;
  const enrollments = await context.enrollmentsMap;

  Assert.ok(!context.isFirstStartup, "should not set the first startup flag");
  Assert.deepEqual(
    activeSlugs,
    ["foo"],
    "should return slugs for all the active experiment"
  );
  Assert.deepEqual(
    activeRollouts,
    ["baz"],
    "should return slugs for all rollouts stored"
  );
  Assert.deepEqual(
    enrollments,
    {
      foo: "bar",
      baz: "qux",
    },
    "should return a map of slugs to branch slugs"
  );

  await NimbusTestUtils.cleanupManager(["foo", "baz"]);
  await cleanup();
});

add_task(async function testIsFirstStartup() {
  using disposable = new DisposableStack();
  disposable.use(setupFirstStartup(FirstStartup.IN_PROGRESS));

  const { cleanup, manager } = await NimbusTestUtils.setupTest();

  const context = manager.createTargetingContext();
  Assert.ok(context.isFirstStartup, "should set the first startup flag");

  await cleanup();
});

add_task(async function testIsNonStubFirstRun() {
  Assert.ok(
    !Services.prefs.getBoolPref("nimbus.firstUpdateComplete", false),
    "nimbus.firstUpdateComplete should be false on a new profile"
  );

  const { loader, cleanup } = await NimbusTestUtils.setupTest();

  Assert.ok(
    Services.prefs.getBoolPref("nimbus.firstUpdateComplete", false),
    "nimbus.firstUpdateComplete should be true after the first updateRecipes call"
  );
  Assert.ok(
    !loader.manager.createTargetingContext().isNonStubFirstRun,
    "isNonStubFirstRun should be false after the first updateRecipes call"
  );

  await loader.updateRecipes("test");

  Assert.ok(
    Services.prefs.getBoolPref("nimbus.firstUpdateComplete", false),
    "nimbus.firstUpdateComplete should remain true after subsequent updateRecipes calls"
  );
  Assert.ok(
    !loader.manager.createTargetingContext().isNonStubFirstRun,
    "isNonStubFirstRun should remain false after subsequent updateRecipes calls"
  );

  await cleanup();
});
