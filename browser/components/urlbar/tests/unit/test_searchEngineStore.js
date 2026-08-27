/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test whether the SearchEngineStore stays in sync with the search service,
 * and that PartialSearchEngine caches and invalidates its icon correctly.
 */

let store;
let privateStore;

function assertEngineStoresInSync() {
  for (let engineStore of [store, privateStore]) {
    info(
      "Checking " + (engineStore == store ? "regular" : "private") + " store."
    );
    let partialEngines = engineStore.getEngines();
    let actualEngines = SearchService.visibleEngines;
    Assert.equal(partialEngines.length, actualEngines.length, "Correct number");
    let actualDefault = engineStore.isPrivate
      ? SearchService.defaultPrivateEngine
      : SearchService.defaultEngine;
    Assert.equal(engineStore.default.id, actualDefault.id, "correct default");
    for (let i = 0; i < partialEngines.length; i++) {
      Assert.equal(
        partialEngines[i].name,
        actualEngines[i].name,
        "Correct name"
      );
      Assert.equal(partialEngines[i].id, actualEngines[i].id, "correct id");
    }
  }
}

function createEngineStore(isPrivate) {
  let childController = UrlbarTestUtils.newMockController({
    input: {
      isPrivate,
      window: {
        location: {
          href: AppConstants.BROWSER_CHROME_URL,
        },
      },
    },
  });
  // The mock controller marks its store ready so queries dispatch without one.
  // This test drives the real init path, which needs a pristine store.
  childController.engineStore.initialized = false;
  return childController.engineStore;
}

add_setup(async function () {
  Services.prefs.setBoolPref(
    "browser.search.separatePrivateDefault.ui.enabled",
    true
  );
  Services.prefs.setBoolPref("browser.search.separatePrivateDefault", true);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(
      "browser.search.separatePrivateDefault.ui.enabled"
    );
    Services.prefs.clearUserPref("browser.search.separatePrivateDefault");
  });

  store = createEngineStore(false);
  await store.init();

  privateStore = createEngineStore(true);
  await privateStore.init();
});

add_task(async function test_initial() {
  Assert.ok(!store.isPrivate, "Public store is public");
  Assert.ok(privateStore.isPrivate, "Private store is private");
  assertEngineStoresInSync();
});

add_task(async function test_reload() {
  await SearchTestUtils.updateRemoteSettingsConfig([
    { identifier: "engine1" },
    { identifier: "engine2" },
    { identifier: "engine3" },
  ]);
  assertEngineStoresInSync();
});

add_task(async function test_changeDefault() {
  for (let name of ["engine3", "engine1"]) {
    info(`Set ${name} as the default engine.`);
    let engine = SearchService.getEngineByName(name);
    await SearchService.setDefault(engine, SearchService.CHANGE_REASON.UNKNOWN);
    assertEngineStoresInSync();
  }
});

add_task(async function test_changeDefaultPrivate() {
  for (let name of ["engine3", "engine1"]) {
    info(`Set ${name} as the default private engine.`);
    let engine = SearchService.getEngineByName(name);
    await SearchService.setDefaultPrivate(
      engine,
      SearchService.CHANGE_REASON.UNKNOWN
    );
    assertEngineStoresInSync();
  }
});

add_task(async function test_addAndRemoveEngine() {
  info("Add a new engine.");
  let extension = await SearchTestUtils.installSearchExtension(
    { name: "Added Engine" },
    { skipUnload: true }
  );
  assertEngineStoresInSync();

  info("Remove the engine again.");
  await extension.unload();
  assertEngineStoresInSync();
});

add_task(async function test_addAndRemoveDefaultEngine() {
  info("Add an engine and make it the default.");
  let extension = await SearchTestUtils.installSearchExtension(
    { name: "New Default" },
    { setAsDefault: true, skipUnload: true }
  );
  assertEngineStoresInSync();

  info("Remove the default.");
  await extension.unload();
  assertEngineStoresInSync();
});

add_task(async function test_hideAndChangeOrder() {
  let engine1 = SearchService.getEngineByName("engine1");
  let engine3 = SearchService.getEngineByName("engine3");

  info("Hide engine1.");
  engine1.hidden = true;
  assertEngineStoresInSync();

  info("Move engine3 to the front.");
  await SearchService.moveEngine(engine3, 0);
  assertEngineStoresInSync();

  info("Unhide engine1, move it and make it the default.");
  engine1.hidden = false;
  await SearchService.moveEngine(engine1, 1);
  await SearchService.setDefault(engine1, SearchService.CHANGE_REASON.UNKNOWN);
  assertEngineStoresInSync();
});

add_task(async function test_hideAndChangeOrderSkipHidden() {
  let engine1 = SearchService.getEngineByName("engine1");
  let engine3 = SearchService.getEngineByName("engine3");

  info("Hide engine1.");
  engine1.hidden = true;
  assertEngineStoresInSync();

  info("Move engine3 to the front.");
  await SearchService.moveEngine(engine3, 0, null, true);
  assertEngineStoresInSync();

  info("Unhide engine1, move it and make it the default.");
  engine1.hidden = false;
  await SearchService.moveEngine(engine1, 1, null, true);
  await SearchService.setDefault(engine1, SearchService.CHANGE_REASON.UNKNOWN);
  assertEngineStoresInSync();
});

add_task(async function test_reloadDifferentConfig() {
  info("Reload a config with different engines, order and default.");
  await SearchTestUtils.updateRemoteSettingsConfig([
    { identifier: "engine4" },
    { identifier: "engine2" },
    { identifier: "engine5" },
    { recordType: "defaultEngines", globalDefault: "engine2" },
  ]);
  assertEngineStoresInSync();
});

add_task(async function test_getIconURL() {
  const icon = "data:with-icon";
  let sandbox = sinon.createSandbox();
  let partialEngine = store.default;
  let realEngine = SearchService.getEngineById(partialEngine.id);

  info("Simulate some icon.");
  let stub = sandbox.stub(realEngine, "getIconURL").resolves(icon);
  partialEngine.invalidateIcon();

  Assert.equal(await partialEngine.getIconURL(), icon, "Returns the icon.");
  Assert.equal(await partialEngine.getIconURL(), icon, "Still returns it.");
  Assert.equal(stub.callCount, 1, "The icon was cached.");

  info("Simulate no icon.");
  stub.resolves(undefined);
  partialEngine.invalidateIcon();

  Assert.equal(await partialEngine.getIconURL(), null, "Returns null.");
  Assert.equal(await partialEngine.getIconURL(), null, "Still returns null.");
  Assert.equal(stub.callCount, 2, "The icon was cached.");

  partialEngine.invalidateIcon();
  sandbox.restore();
});
