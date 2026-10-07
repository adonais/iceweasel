/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// A 2xx response whose body is not a location (a captive portal or proxy
// page, an unexpected JSON shape) is a failed request: it must be counted as
// one, must not be cached, and must back the retry timer off. With no service
// URL configured no request is sent at all.

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const POSITION_UNAVAILABLE = 2;
const PROVIDER_TIMER_NAME = "NetworkGeolocationProvider";
// Long enough that the repeating timer never fires during the test.
const TIMER_INTERVAL_MS = 120 * 1000;

let httpserver = null;
let requestCount = 0;
let responseBody = "";
let responseContentType = "text/html";

function geoHandler(metadata, response) {
  requestCount++;
  response.setStatusLine("1.0", 200, "OK");
  response.setHeader("Cache-Control", "no-cache", false);
  response.setHeader("Content-Type", responseContentType, false);
  response.write(responseBody);
}

function providerTimers() {
  return Cc["@mozilla.org/timer-manager;1"]
    .getService(Ci.nsITimerManager)
    .getTimers()
    .filter(timer => timer.name == PROVIDER_TIMER_NAME);
}

function failureCount() {
  return Glean.geolocation.networkFailures.network_ip.testGetValue() ?? 0;
}

function requestMetricCount() {
  return Glean.geolocation.geolocationService.network_ip.testGetValue() ?? 0;
}

function cacheHitCount() {
  return (
    Glean.geolocation.geolocationCacheHit.NetworkGeolocationProvider.testGetValue() ??
    0
  );
}

// Starts a provider, issues one request through watch() and resolves with the
// listener outcome once the provider has reported it.
async function requestOnce() {
  let provider = Cc["@mozilla.org/geolocation/mls-provider;1"].createInstance(
    Ci.nsIGeolocationProvider
  );
  let outcome = new Promise(resolve => {
    let listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIGeolocationUpdate"]),
      update(position) {
        resolve({ position });
      },
      notifyError(code) {
        resolve({ code });
      },
    };
    provider.startup();
    provider.watch(listener);
  });
  return { provider, outcome: await outcome };
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
  Services.prefs.setIntPref(
    "geo.provider.network.timeToWaitBeforeSending",
    TIMER_INTERVAL_MS
  );
  // The default cap is below TIMER_INTERVAL_MS and would hide the backoff.
  Services.prefs.setIntPref(
    "geo.provider.network.backoffMaxMs",
    10 * TIMER_INTERVAL_MS
  );

  registerCleanupFunction(
    () => new Promise(resolve => httpserver.stop(resolve))
  );
});

async function checkBadResponse(body, contentType) {
  responseBody = body;
  responseContentType = contentType;
  let requestsBefore = requestCount;
  let failuresBefore = failureCount();
  let cacheHitsBefore = cacheHitCount();

  let { provider, outcome } = await requestOnce();
  Assert.equal(requestCount, requestsBefore + 1, "one request was sent");
  Assert.equal(
    outcome.code,
    POSITION_UNAVAILABLE,
    "the listener got POSITION_UNAVAILABLE"
  );
  Assert.equal(failureCount(), failuresBefore + 1, "counted as a failure");

  let timers = providerTimers();
  Assert.equal(timers.length, 1, "the repeating timer is armed");
  Assert.greater(
    timers[0].delay,
    TIMER_INTERVAL_MS,
    "the repeating timer backed off"
  );

  // A second IP-only request would be served from the cache had the bad
  // response been cached.
  provider.shutdown();
  ({ provider, outcome } = await requestOnce());
  Assert.equal(
    requestCount,
    requestsBefore + 2,
    "the next request goes to the network again"
  );
  Assert.equal(outcome.code, POSITION_UNAVAILABLE, "and fails again");
  Assert.equal(cacheHitCount(), cacheHitsBefore, "nothing was cached");
  provider.shutdown();
}

add_task(async function test_html_body() {
  await checkBadResponse(
    "<!DOCTYPE html><html><body>Sign in to the network</body></html>",
    "text/html"
  );
});

add_task(async function test_json_without_location() {
  await checkBadResponse(
    JSON.stringify({ status: "OK", accuracy: 42 }),
    "application/json"
  );
});

add_task(async function test_no_url_configured() {
  for (let url of ["", "about:blank"]) {
    Services.prefs.setCharPref("geo.provider.network.url", url);
    let requestsBefore = requestCount;
    let requestMetricBefore = requestMetricCount();

    let { provider, outcome } = await requestOnce();
    Assert.equal(requestCount, requestsBefore, `no request sent for "${url}"`);
    Assert.equal(
      requestMetricCount(),
      requestMetricBefore,
      "no request was counted"
    );
    Assert.equal(
      outcome.code,
      POSITION_UNAVAILABLE,
      "the listener got POSITION_UNAVAILABLE"
    );
    provider.shutdown();
  }
});
