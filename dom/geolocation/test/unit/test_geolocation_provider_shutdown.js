/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// A provider shut down while a request is in flight must stay shut down when
// that request settles.

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const PROVIDER_TIMER_NAME = "NetworkGeolocationProvider";

let httpserver = null;
let pendingResponse = null;
let requestArrived = null;

function geoHandler(metadata, response) {
  response.processAsync();
  pendingResponse = response;
  requestArrived();
}

function providerTimers() {
  return Cc["@mozilla.org/timer-manager;1"]
    .getService(Ci.nsITimerManager)
    .getTimers()
    .filter(timer => timer.name == PROVIDER_TIMER_NAME);
}

function settle() {
  return new Promise(resolve => Services.tm.dispatchToMainThread(resolve));
}

add_setup(async function () {
  do_get_profile();
  Services.fog.initializeFOG();

  httpserver = new HttpServer();
  httpserver.registerPathHandler("/geo", geoHandler);
  httpserver.start(-1);

  Services.prefs.setCharPref(
    "geo.provider.network.url",
    `http://localhost:${httpserver.identity.primaryPort}/geo`
  );
  Services.prefs.setBoolPref("geo.provider.network.scan", false);

  registerCleanupFunction(
    () => new Promise(resolve => httpserver.stop(resolve))
  );
});

add_task(async function test_no_timer_after_shutdown_with_request_in_flight() {
  let provider = Cc["@mozilla.org/geolocation/mls-provider;1"].createInstance(
    Ci.nsIGeolocationProvider
  );
  let listener = {
    QueryInterface: ChromeUtils.generateQI(["nsIGeolocationUpdate"]),
    update() {},
    notifyError() {},
  };

  let arrived = new Promise(resolve => {
    requestArrived = resolve;
  });
  provider.startup();
  // watch() issues the first request.
  provider.watch(listener);
  await arrived;
  Assert.greater(
    providerTimers().length,
    0,
    "the started provider has its repeating timer armed"
  );

  provider.shutdown();
  Assert.equal(providerTimers().length, 0, "shutdown cancels the timer");

  pendingResponse.setStatusLine("1.0", 500, "Internal Server Error");
  pendingResponse.finish();
  await TestUtils.waitForCondition(
    () => Glean.geolocation.networkFailures.network_ip.testGetValue() == 1,
    "the in-flight request settled as a failure"
  );
  await settle();
  await settle();

  Assert.equal(
    providerTimers().length,
    0,
    "a request settling after shutdown does not re-arm the timer"
  );
});
