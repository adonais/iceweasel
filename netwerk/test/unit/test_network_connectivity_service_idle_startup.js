/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

function promiseObserverNotification(topicName) {
  return new Promise(resolve => {
    Services.obs.addObserver(function observe(subject, topic, data) {
      Services.obs.removeObserver(observe, topic);
      resolve({ subject, data });
    }, topicName);
  });
}

let requestCount = 0;
let httpserver = null;
let httpserverv6 = null;

function contentHandler(metadata, response) {
  requestCount++;
  response.setHeader("Content-Type", "text/plain");
  response.setHeader("Cache-Control", "no-cache");

  const responseBody = "anybody";
  response.bodyOutputStream.write(responseBody, responseBody.length);
}

registerCleanupFunction(async () => {
  Services.prefs.clearUserPref(
    "network.connectivity-service.wait_for_idle_startup"
  );
  Services.prefs.clearUserPref("network.captive-portal-service.testMode");
  Services.prefs.clearUserPref("network.connectivity-service.IPv4.url");
  Services.prefs.clearUserPref("network.connectivity-service.IPv6.url");
  Services.prefs.clearUserPref("network.connectivity-service.nat64-check");
  await new Promise(resolve => httpserver.stop(resolve));
  await new Promise(resolve => httpserverv6.stop(resolve));
});

// GeckoView notifies browser-idle-startup-tasks-finished once per window, which
// on Android happens for every applink. The connectivity checks should only run
// for the first notification. See bug 2064222.
add_task(async function test_idle_startup_only_checks_once() {
  Services.prefs.setBoolPref(
    "network.connectivity-service.wait_for_idle_startup",
    true
  );
  Services.prefs.setBoolPref("network.captive-portal-service.testMode", true);
  Services.prefs.setBoolPref("network.connectivity-service.nat64-check", false);

  httpserver = new HttpServer();
  httpserver.registerPathHandler("/content", contentHandler);
  httpserver.start(-1);

  httpserverv6 = new HttpServer();
  httpserverv6.registerPathHandler("/content", contentHandler);
  httpserverv6._start(-1, "[::1]");

  Services.prefs.setCharPref(
    "network.connectivity-service.IPv4.url",
    `http://localhost:${httpserver.identity.primaryPort}/content`
  );
  Services.prefs.setCharPref(
    "network.connectivity-service.IPv6.url",
    `http://[::1]:${httpserverv6.identity.primaryPort}/content`
  );

  let ncs = Cc[
    "@mozilla.org/network/network-connectivity-service;1"
  ].getService(Ci.nsINetworkConnectivityService);

  // ScriptPreloader asserts that this is notified before the idle startup one.
  Services.obs.notifyObservers(null, "browser-delayed-startup-finished");

  let notification = promiseObserverNotification(
    "network:connectivity-service:ip-checks-complete"
  );
  Services.obs.notifyObservers(null, "browser-idle-startup-tasks-finished");
  await notification;

  equal(requestCount, 2, "The first idle startup performs the IP checks");

  // Simulate a few more applinks. None of them should hit the endpoints.
  for (let i = 0; i < 3; i++) {
    Services.obs.notifyObservers(null, "browser-idle-startup-tasks-finished");
  }

  // Issue an explicit recheck and wait for it, so that any request triggered by
  // the notifications above would have reached the server by then.
  notification = promiseObserverNotification(
    "network:connectivity-service:ip-checks-complete"
  );
  ncs.recheckIPConnectivity();
  await notification;

  equal(requestCount, 4, "Subsequent idle startup notifications are ignored");
});
