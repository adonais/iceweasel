/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AsyncShutdown: "resource://gre/modules/AsyncShutdown.sys.mjs",
  AdsClient: "resource://newtab/lib/AdsClient.sys.mjs",
  _AdsClient: "resource://newtab/lib/AdsClient.sys.mjs",
  TestUtils: "resource://testing-common/TestUtils.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
});

const PREF_UNIFIED_ADS_ADSCLIENT_ENABLED = "unifiedAds.adsClient.enabled";

let gSandbox;
add_setup(() => {
  gSandbox = lazy.sinon.createSandbox();
  registerCleanupFunction(() => {
    gSandbox.restore();
  });
});

add_setup(function test_setup_fog() {
  do_get_profile();
  Services.fog.initializeFOG();
});

add_task(function test_isEnabled() {
  Assert.strictEqual(
    lazy.AdsClient.isEnabled({}),
    false,
    "Gated off by default (no pref, no trainhopConfig)"
  );

  Assert.strictEqual(
    lazy.AdsClient.isEnabled(undefined),
    false,
    "Gated off when prefs are missing"
  );

  Assert.strictEqual(
    lazy.AdsClient.isEnabled({ [PREF_UNIFIED_ADS_ADSCLIENT_ENABLED]: true }),
    true,
    "Enabled by the local about:config pref"
  );

  Assert.strictEqual(
    lazy.AdsClient.isEnabled({
      trainhopConfig: { adsClient: { enabled: true } },
    }),
    true,
    "Enabled by trainhopConfig.adsClient.enabled"
  );

  Assert.strictEqual(
    lazy.AdsClient.isEnabled({
      trainhopConfig: { adsClient: { enabled: false } },
    }),
    false,
    "Disabled when trainhopConfig.adsClient.enabled is false"
  );
});

add_task(function test_getClient_singleton() {
  const adsClient = new lazy._AdsClient();

  const client = adsClient.getClient();
  Assert.ok(client, "getClient builds and returns a MozAdsClient");

  const sameClient = adsClient.getClient();
  Assert.strictEqual(
    sameClient,
    client,
    "getClient returns the same cached singleton"
  );
});

add_task(async function test_getClient_opensCacheDatabase() {
  const adsClient = new lazy._AdsClient();
  Assert.ok(adsClient.getClient(), "getClient built a MozAdsClient");

  Assert.ok(
    await IOUtils.exists(adsClient.cacheConfig.dbPath),
    "Building the client opened the SQLite HTTP cache in the profile"
  );
});

add_task(function test_buildTelemetry_recordsToGlean() {
  Services.fog.testResetFOG();

  const telemetry = new lazy._AdsClient().buildTelemetry();

  telemetry.recordBuildCacheError("empty_db_path", "the db path is empty");
  Assert.equal(
    Glean.adsClient.buildCacheError.empty_db_path.testGetValue(),
    "the db path is empty",
    "recordBuildCacheError sets ads_client.build_cache_error"
  );

  telemetry.recordClientError("request_ads", "network error");
  Assert.equal(
    Glean.adsClient.clientError.request_ads.testGetValue(),
    "network error",
    "recordClientError sets ads_client.client_error"
  );

  telemetry.recordClientOperationTotal("request_ads");
  telemetry.recordClientOperationTotal("request_ads");
  Assert.equal(
    Glean.adsClient.clientOperationTotal.request_ads.testGetValue(),
    2,
    "recordClientOperationTotal increments ads_client.client_operation_total"
  );

  telemetry.recordDeserializationError("invalid_ad_item", "expected an object");
  Assert.equal(
    Glean.adsClient.deserializationError.invalid_ad_item.testGetValue(),
    "expected an object",
    "recordDeserializationError sets ads_client.deserialization_error"
  );

  telemetry.recordHttpCacheOutcome("hit", "");
  Assert.equal(
    Glean.adsClient.httpCacheOutcome.hit.testGetValue(),
    "",
    "recordHttpCacheOutcome sets ads_client.http_cache_outcome"
  );

  // trim_failed is emitted by MozAdsTelemetryWrapper but was missing from the
  // component's own label list, so make sure it does not land in __other__.
  telemetry.recordHttpCacheOutcome("trim_failed", "trim boom");
  Assert.equal(
    Glean.adsClient.httpCacheOutcome.trim_failed.testGetValue(),
    "trim boom",
    "trim_failed is a declared label"
  );
  Assert.equal(
    Glean.adsClient.httpCacheOutcome.__other__.testGetValue(),
    null,
    "no label overflowed into __other__"
  );
});

// A trainhopped New Tab can run on a Firefox whose libxul predates these
// metrics, and the runtime registration that backfills them is not awaited.
add_task(function test_buildTelemetry_survivesMissingMetrics() {
  Services.fog.testResetFOG();

  const telemetry = new lazy._AdsClient().buildTelemetry(() => undefined);

  telemetry.recordBuildCacheError("empty_db_path", "boom");
  telemetry.recordClientError("request_ads", "boom");
  telemetry.recordClientOperationTotal("request_ads");
  telemetry.recordDeserializationError("invalid_ad_item", "boom");
  telemetry.recordHttpCacheOutcome("hit", "");

  // Reaching here means nothing threw. Also check nothing fell back to the
  // real category behind our back.
  Assert.equal(
    Glean.adsClient.clientError.request_ads.testGetValue(),
    null,
    "no string metric recorded when ads_client is not registered"
  );
  Assert.equal(
    Glean.adsClient.clientOperationTotal.request_ads.testGetValue(),
    null,
    "no counter incremented when ads_client is not registered"
  );
});

// The category is resolved per recording, so metrics registered after the
// client was built are still picked up.
add_task(function test_buildTelemetry_resolvesMetricsLate() {
  Services.fog.testResetFOG();

  let category;
  const telemetry = new lazy._AdsClient().buildTelemetry(() => category);

  telemetry.recordClientError("report_ad", "dropped while unregistered");
  Assert.equal(
    Glean.adsClient.clientError.report_ad.testGetValue(),
    null,
    "recordings before registration are dropped"
  );

  category = Glean.adsClient;
  telemetry.recordClientError("report_ad", "recorded once available");

  Assert.equal(
    Glean.adsClient.clientError.report_ad.testGetValue(),
    "recorded once available",
    "the late-registered category is used without rebuilding the client"
  );
});

add_task(async function test_shutdown_blocker() {
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);

  const adsClient = new lazy._AdsClient();
  Assert.ok(
    !adsClient.hasShutdown,
    "adsClient should not be uninitialized yet"
  );

  const client = adsClient.getClient();
  Assert.ok(client, "getClient builds and returns a MozAdsClient");

  await lazy.TestUtils.waitForTick();
  gSandbox.spy(adsClient, "uninit");

  // Simulate shutdown.
  lazy.AsyncShutdown.profileChangeTeardown._trigger();
  await lazy.TestUtils.waitForTick();
  await lazy.TestUtils.waitForCondition(
    () => adsClient.uninit.calledOnce,
    "The `uninit` function should be called on shutdown"
  );
  Assert.ok(adsClient.hasShutdown, "adsClient should now be uninitialized");

  lazy.AsyncShutdown.profileChangeTeardown._reset();
  Services.prefs.clearUserPref("toolkit.asyncshutdown.testing");
  gSandbox.restore();
});

add_task(async function test_dont_register_blocker_if_in_shutdown() {
  // Test a corner case: the AdsClient is initialized during shutdown.
  //
  // In this case it shouldn't register a shutdown blocker, because it's too late to do that.
  // Instead, it should just stop the initialization (which is lazy and only triggers on getClient()) and return `null`.
  //
  // See adjacent bug for ContextRelevancyManager https://bugzilla.mozilla.org/show_bug.cgi?id=1990569
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  await lazy.TestUtils.waitForTick();

  const adsClient = new lazy._AdsClient();
  Assert.ok(!adsClient.hasShutdown, "adsClient not be uninitialized yet");
  gSandbox.spy(adsClient, "uninit");

  // Simulate shutdown.
  lazy.AsyncShutdown.profileChangeTeardown._trigger();
  Assert.ok(
    !adsClient.hasShutdown,
    "adsClient should not have shut down before creation"
  );

  // Now attempt to create instance, but ensure it doesn't create.
  // `uninit` function will not get called here.
  Assert.equal(
    adsClient.getClient(),
    null,
    "adsClient should be null on creation if past profileChangeTeardown"
  );

  lazy.AsyncShutdown.profileChangeTeardown._reset();
  Services.prefs.clearUserPref("toolkit.asyncshutdown.testing");
  gSandbox.restore();
});
