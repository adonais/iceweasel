/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

let geolocation = null;
let requestCount = 0;

function geoHandler(metadata, response) {
  requestCount++;
  let georesponse = JSON.stringify({
    status: "OK",
    location: { lat: 42, lng: 42 },
    accuracy: 42,
  });
  response.setStatusLine("1.0", 200, "OK");
  response.setHeader("Cache-Control", "no-cache", false);
  response.setHeader("Content-Type", "application/x-javascript", false);
  response.write(georesponse);
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    // maximumAge: 0 bypasses the geolocation service's own position cache so we
    // exercise the NetworkGeolocationProvider request cache specifically.
    geolocation.getCurrentPosition(resolve, reject, { maximumAge: 0 });
  });
}

add_setup(async function () {
  let httpserver = new HttpServer();
  httpserver.registerPathHandler("/geo", geoHandler);
  httpserver.start(-1);

  Services.prefs.setCharPref(
    "geo.provider.network.url",
    `http://localhost:${httpserver.identity.primaryPort}/geo`
  );
  // IP-only lookups, so a repeated request is a deterministic cache hit.
  Services.prefs.setBoolPref("geo.provider.network.scan", false);
  Services.prefs.setBoolPref(
    "geo.provider.network.debug.requestCache.enabled",
    true
  );

  geolocation = Cc["@mozilla.org/geolocation;1"].getService(Ci.nsISupports);

  registerCleanupFunction(
    () => new Promise(resolve => httpserver.stop(resolve))
  );
});

add_task(async function cache_is_reused() {
  await getCurrentPosition();
  Assert.equal(requestCount, 1, "first lookup performs a network request");

  await getCurrentPosition();
  Assert.equal(requestCount, 1, "second lookup is served from the cache");
});
