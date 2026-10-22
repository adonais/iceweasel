"use strict";

const { TelemetryController } = ChromeUtils.importESModule(
  "resource://gre/modules/TelemetryController.sys.mjs"
);

const { ClientEnvironment } = ChromeUtils.importESModule(
  "resource://normandy/lib/ClientEnvironment.sys.mjs"
);
const { NormandyTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NormandyTestUtils.sys.mjs"
);

add_task(async function testTelemetry() {
  // setup
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.reduceTimerPrecision", true]],
  });

  await TelemetryController.submitExternalPing("testfoo", { foo: 1 });
  await TelemetryController.submitExternalPing("testbar", { bar: 2 });
  await TelemetryController.submitExternalPing("testfoo", { foo: 3 });

  // Test it can access telemetry
  const telemetry = await ClientEnvironment.telemetry;
  is(typeof telemetry, "object", "Telemetry is accesible");

  // Test it reads different types of telemetry
  is(
    telemetry.testfoo.payload.foo,
    3,
    "telemetry filters pull the latest ping from a type"
  );
  is(
    telemetry.testbar.payload.bar,
    2,
    "telemetry filters pull from submitted telemetry pings"
  );
});

add_task(async function testUserId() {
  // Test that userId is available
  ok(NormandyTestUtils.isUuid(ClientEnvironment.userId), "userId available");

  // test that it pulls from the right preference
  await SpecialPowers.pushPrefEnv({
    set: [["app.normandy.user_id", "fake id"]],
  });
  is(ClientEnvironment.userId, "fake id", "userId is pulled from preferences");
});

add_task(async function testDistribution() {
  // distribution id defaults to "default" for most builds,
  // "mozilla-MSIX" for MSIX builds, and "mozilla-official" for
  // official Mozilla builds.
  let expectedDistribution = "default";
  if (
    AppConstants.platform === "win" &&
    Services.sysinfo.getProperty("hasWinPackageId")
  ) {
    expectedDistribution = "mozilla-MSIX";
  } else if (AppConstants.BUILT_BY_MOZILLA) {
    expectedDistribution = "mozilla-official";
  }
  is(
    ClientEnvironment.distribution,
    expectedDistribution,
    "distribution has a default value"
  );

  // distribution id is read from a preference
  Services.prefs
    .getDefaultBranch(null)
    .setCharPref("distribution.id", "funnelcake");
  is(
    ClientEnvironment.distribution,
    "funnelcake",
    "distribution is read from preferences"
  );
  Services.prefs
    .getDefaultBranch(null)
    .setCharPref("distribution.id", "default");
});

const mockClassify = { country: "FR", request_time: new Date(2017, 1, 1) };
add_task(
  ClientEnvironment.withMockClassify(
    mockClassify,
    async function testCountryRequestTime() {
      // Test that country and request_time pull their data from the server.
      is(
        await ClientEnvironment.country,
        mockClassify.country,
        "country is read from the server API"
      );
      is(
        await ClientEnvironment.request_time,
        mockClassify.request_time,
        "request_time is read from the server API"
      );
    }
  )
);

add_task(async function testSync() {
  is(
    ClientEnvironment.syncMobileDevices,
    0,
    "syncMobileDevices defaults to zero"
  );
  is(
    ClientEnvironment.syncDesktopDevices,
    0,
    "syncDesktopDevices defaults to zero"
  );
  is(
    ClientEnvironment.syncTotalDevices,
    0,
    "syncTotalDevices defaults to zero"
  );
  await SpecialPowers.pushPrefEnv({
    set: [
      ["services.sync.clients.devices.mobile", 5],
      ["services.sync.clients.devices.desktop", 4],
    ],
  });
  is(
    ClientEnvironment.syncMobileDevices,
    5,
    "syncMobileDevices is read when set"
  );
  is(
    ClientEnvironment.syncDesktopDevices,
    4,
    "syncDesktopDevices is read when set"
  );
  is(
    ClientEnvironment.syncTotalDevices,
    9,
    "syncTotalDevices is read when set"
  );
});

add_task(async function testDoNotTrack() {
  // doNotTrack defaults to false
  ok(!ClientEnvironment.doNotTrack, "doNotTrack has a default value");

  // doNotTrack is read from a preference
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.donottrackheader.enabled", true]],
  });
  ok(ClientEnvironment.doNotTrack, "doNotTrack is read from preferences");
});

add_task(async function isFirstRun() {
  await SpecialPowers.pushPrefEnv({ set: [["app.normandy.first_run", true]] });
  ok(ClientEnvironment.isFirstRun, "isFirstRun is read from preferences");
});
