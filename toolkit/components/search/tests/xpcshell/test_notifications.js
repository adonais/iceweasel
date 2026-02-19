/* Any copyright is dedicated to the Public Domain.
 *    http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let engine;
let appDefaultEngine;

add_setup(async function () {
  useHttpServer();

  Services.prefs.setBoolPref(
    SearchUtils.BROWSER_SEARCH_PREF + "separatePrivateDefault.ui.enabled",
    true
  );
  Services.prefs.setBoolPref(
    SearchUtils.BROWSER_SEARCH_PREF + "separatePrivateDefault",
    true
  );

  appDefaultEngine = await Services.search.getDefault();
});

add_task(async function test_addingEngine_opensearch() {
  const addEngineObserver = new SearchObserver([
    [
      // engine-added
      // Engine was added to the store by the search service.
      SearchUtils.MODIFIED_TYPE.ADDED,
      "Test search engine",
    ],
  ]);

  await SearchTestUtils.installOpenSearchEngine({
    url: `${gHttpURL}/opensearch/generic1.xml`,
  });

  engine = await addEngineObserver.promise;

  engine = Services.search.getEngineByName("Test search engine");
  Assert.ok(engine, "Should have added the engine");
});

add_task(async function test_addingEngine_webExtension() {
  const addEngineObserver = new SearchObserver([
    [
      // engine-added
      // Engine was added to the store by the search service.
      SearchUtils.MODIFIED_TYPE.ADDED,
      "Example Engine",
    ],
  ]);

  await SearchTestUtils.installSearchExtension({
    name: "Example Engine",
  });

  await addEngineObserver.promise;

  let webExtensionEngine = Services.search.getEngineByName("Example Engine");
  Assert.ok(webExtensionEngine, "Should have added the web extension engine");
});

async function defaultNotificationTest(
  setPrivateDefault,
  expectNotificationForPrivate
) {
  let expected = expectNotificationForPrivate
    ? [[SearchUtils.MODIFIED_TYPE.DEFAULT_PRIVATE, engine.name]]
    : [[SearchUtils.MODIFIED_TYPE.DEFAULT, engine.name]];
  const defaultObserver = new SearchObserver(expected);
  await Services.search[setPrivateDefault ? "setDefaultPrivate" : "setDefault"](
    engine,
    Ci.nsISearchService.CHANGE_REASON_UNKNOWN
  );
  await defaultObserver.promise;
}

add_task(async function test_defaultEngine_notifications() {
  await defaultNotificationTest(false, false);
});

add_task(async function test_defaultPrivateEngine_notifications() {
  await defaultNotificationTest(true, true);
});

add_task(
  async function test_defaultPrivateEngine_notifications_when_not_enabled() {
    await Services.search.setDefault(
      appDefaultEngine,
      Ci.nsISearchService.CHANGE_REASON_UNKNOWN
    );

    Services.prefs.setBoolPref(
      SearchUtils.BROWSER_SEARCH_PREF + "separatePrivateDefault",
      false
    );

    await defaultNotificationTest(true, true);
  }
);

add_task(async function test_removeEngine() {
  await Services.search.setDefault(
    engine,
    Ci.nsISearchService.CHANGE_REASON_UNKNOWN
  );
  await Services.search.setDefaultPrivate(
    engine,
    Ci.nsISearchService.CHANGE_REASON_UNKNOWN
  );

  const removedObserver = new SearchObserver([
    [SearchUtils.MODIFIED_TYPE.DEFAULT, appDefaultEngine.name],
    [SearchUtils.MODIFIED_TYPE.DEFAULT_PRIVATE, appDefaultEngine.name],
    [SearchUtils.MODIFIED_TYPE.REMOVED, engine.name],
  ]);

  await Services.search.removeEngine(engine);

  await removedObserver.promise;
});
