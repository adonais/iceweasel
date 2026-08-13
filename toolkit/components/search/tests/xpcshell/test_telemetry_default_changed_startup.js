/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/*
 * Tests for the default search engine changed telemetry to ensure that it
 * is not incorrectly recorded on an unrelated change after startup (i.e. before
 * any other event is recorded).
 */

"use strict";

const CONFIG = [
  { identifier: "normalDefault", base: { name: "normalDefault" } },
  { identifier: "privateDefault", base: { name: "privateDefault" } },
  { globalDefault: "normalDefault", globalDefaultPrivate: "privateDefault" },
];

const UPDATED_CONFIG = [
  { identifier: "normalDefault", base: { name: "Normal" } },
  { identifier: "privateDefault", base: { name: "Private" } },
  { globalDefault: "normalDefault", globalDefaultPrivate: "privateDefault" },
];

async function checkTelemetry(
  source,
  prevEngine,
  newEngine,
  checkPrivate = false
) {
  let snapshot;
  if (checkPrivate) {
    snapshot = Glean.searchEnginePrivate.changed.testGetValue();
  } else {
    snapshot = Glean.searchEngineDefault.changed.testGetValue();
  }

  delete snapshot[0].timestamp;
  Assert.deepEqual(
    snapshot[0],
    {
      category: checkPrivate
        ? "search.engine.private"
        : "search.engine.default",
      name: "changed",
      extra: {
        change_reason: source,
        previous_engine_id: prevEngine?.id ?? "",
        new_engine_id: newEngine?.id ?? "",
        new_display_name: newEngine?.name ?? "",
        new_load_path: newEngine?.loadPath ?? "",
        new_submission_url: newEngine?.submissionURL ?? "",
      },
    },
    "Should have received the correct event details"
  );
  Assert.equal(snapshot.length, 1, "Should have only received one event");
}

add_setup(async () => {
  Services.prefs.setBoolPref(
    SearchUtils.BROWSER_SEARCH_PREF + "separatePrivateDefault.ui.enabled",
    true
  );
  Services.prefs.setBoolPref(
    SearchUtils.BROWSER_SEARCH_PREF + "separatePrivateDefault",
    true
  );

  Region._setHomeRegion("US", false);
  Services.locale.availableLocales = [
    ...Services.locale.availableLocales,
    "en",
    "fr",
  ];
  Services.locale.requestedLocales = ["en"];

  Services.fog.initializeFOG();
  sinon.stub(SearchService, "_showRemovalOfSearchEngineNotificationBox");

  SearchTestUtils.setRemoteSettingsConfig(CONFIG);

  registerCleanupFunction(async () => {
    sinon.restore();
  });
});

add_task(async function test_change_after_startup() {
  Services.fog.testResetFOG();

  await SearchService.init();

  Assert.ok(
    !Glean.searchEngineDefault.changed.testGetValue(),
    "Should not have any events for the normal engine"
  );
  Assert.ok(
    !Glean.searchEnginePrivate.changed.testGetValue(),
    "Should not have any events for the private engine"
  );

  SearchService.getEngineById("normalDefault").alias = "star";
  SearchService.getEngineById("privateDefault").alias = "ship";

  Assert.ok(
    !Glean.searchEngineDefault.changed.testGetValue(),
    "Should not have any events for the normal engine on startup after non-relevant change"
  );
  Assert.ok(
    !Glean.searchEnginePrivate.changed.testGetValue(),
    "Should not have any events for the private engine on startup after non-relevant change"
  );

  await SearchTestUtils.updateRemoteSettingsConfig(UPDATED_CONFIG);

  // Should receive an update after a name change.
  await checkTelemetry(
    "engine-update",
    { id: "normalDefault" },
    {
      id: "normalDefault",
      name: "Normal",
      submissionURL: "https://www.example.com/search?q=",
      loadPath: "[app]normalDefault",
    },
    false
  );
  await checkTelemetry(
    "engine-update",
    { id: "privateDefault" },
    {
      id: "privateDefault",
      name: "Private",
      submissionURL: "https://www.example.com/search?q=",
      loadPath: "[app]privateDefault",
    },
    true
  );
});
