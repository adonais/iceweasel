/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Regression test for bug 2046698: a transaction must never report connection
// timings coming from a connection it did not use. This happens when a
// transaction starts its own connection attempt but is dispatched to another
// connection before that attempt completes.

"use strict";

const { NodeHTTPSServer } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

do_get_profile();
Cc["@mozilla.org/psm;1"].getService(Ci.nsISupports);

let server;

function sleep(ms) {
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  return new Promise(resolve => setTimeout(resolve, ms));
}

add_setup(async function () {
  server = new NodeHTTPSServer();
  await server.start(0, ["localhost"]);

  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 0);

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.http.speculative-parallel-limit");
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    await server.stop();
  });

  // Busy loop, blocking the node event loop. While this request is being
  // served, the TLS handshake of any other connection to this server can not
  // make progress.
  await server.registerPathHandler("/block", (req, resp) => {
    let end = Date.now() + 500;
    while (Date.now() < end) {
      // Intentionally blocking.
    }
    resp.writeHead(200, { "Content-Type": "text/plain" });
    resp.end("blocked");
  });

  await server.registerPathHandler("/plain", (req, resp) => {
    resp.writeHead(200, { "Content-Type": "text/plain" });
    resp.end("ok");
  });
});

async function openChannel(path) {
  let chan = NetUtil.newChannel({
    uri: `https://localhost:${server.port()}${path}`,
    loadUsingSystemPrincipal: true,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
  }).QueryInterface(Ci.nsIHttpChannel);

  await new Promise(resolve => {
    chan.asyncOpen(
      new ChannelListener((_req, _buf) => resolve(), null, CL_ALLOW_UNKNOWN_CL)
    );
  });

  return chan.QueryInterface(Ci.nsITimedChannel);
}

function logTimings(label, tc) {
  info(
    `${label}: domainLookupStart=${tc.domainLookupStartTime} ` +
      `domainLookupEnd=${tc.domainLookupEndTime} ` +
      `connectStart=${tc.connectStartTime} ` +
      `tcpConnectEnd=${tc.tcpConnectEndTime} ` +
      `secureConnectionStart=${tc.secureConnectionStartTime} ` +
      `connectEnd=${tc.connectEndTime} ` +
      `requestStart=${tc.requestStartTime} ` +
      `responseStart=${tc.responseStartTime}`
  );
}

// The connection timings of a single request are either all absent, because the
// request reused a connection, or all present and in order, because it
// established one. A mix means the timings were taken from two different
// connections. Returns whether a connect phase was reported.
function assertCoherentTimings(label, tc) {
  let connected = tc.connectStartTime > 0;
  for (let name of [
    "domainLookupStart",
    "domainLookupEnd",
    "secureConnectionStart",
    "tcpConnectEnd",
    "connectEnd",
  ]) {
    Assert.equal(
      tc[`${name}Time`] > 0,
      connected,
      `${label}: ${name} must be set iff connectStart is set`
    );
  }

  if (connected) {
    Assert.lessOrEqual(
      tc.domainLookupEndTime,
      tc.connectStartTime,
      `${label}: domainLookupEnd <= connectStart`
    );
    Assert.lessOrEqual(
      tc.connectStartTime,
      tc.secureConnectionStartTime,
      `${label}: connectStart <= secureConnectionStart`
    );
    Assert.lessOrEqual(
      tc.secureConnectionStartTime,
      tc.connectEndTime,
      `${label}: secureConnectionStart <= connectEnd`
    );
  }

  return connected;
}

async function resetConnections() {
  Services.obs.notifyObservers(null, "net:cancel-all-connections");
  let tokensCache = Cc["@mozilla.org/network/ssl-tokens-cache;1"].getService(
    Ci.nsISSLTokensCache
  );
  await tokensCache.asyncClearSSLExternalAndInternalSessionCache();
  await sleep(1000);
}

async function doTestMovedTransactionTimings(name) {
  let reusedCount = 0;
  for (let round = 0; round < 3; round++) {
    // Every round starts without a connection to the server, so the request
    // below has to establish one and must report a connect phase.
    await resetConnections();

    // The first request keeps its connection (and the server) busy.
    let blocked = openChannel("/block");
    await sleep(100);

    // This request opens a second connection, whose TLS handshake can not
    // complete while the server is blocked. When the first connection becomes
    // idle, this transaction is dispatched to it instead, leaving the second
    // connection unused.
    let moved = openChannel("/plain");

    let blockedTimings = await blocked;
    logTimings(`${name} round ${round} /block`, blockedTimings);
    Assert.ok(
      assertCoherentTimings(`${name} round ${round} /block`, blockedTimings),
      `${name} round ${round} /block: a new connection reports a connect phase`
    );

    let movedTimings = await moved;
    logTimings(`${name} round ${round} /plain (moved)`, movedTimings);
    if (
      !assertCoherentTimings(
        `${name} round ${round} /plain (moved)`,
        movedTimings
      )
    ) {
      reusedCount++;
    }

    // Later requests may pick up the unused connection from the idle pool.
    for (let i = 0; i < 2; i++) {
      let tc = await openChannel("/plain");
      logTimings(`${name} round ${round} /plain (reuse ${i})`, tc);
      assertCoherentTimings(`${name} round ${round} /plain (reuse ${i})`, tc);
    }
  }

  // Not asserted: whether the second request loses the race for its own
  // connection depends on the timing of the block above.
  info(`${name}: ${reusedCount} of 3 moved requests reused a connection`);
}

add_task(async function test_moved_transaction_timings_happy_eyeballs() {
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  await doTestMovedTransactionTimings("happy eyeballs");
});

add_task(async function test_moved_transaction_timings_no_happy_eyeballs() {
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", false);
  await doTestMovedTransactionTimings("no happy eyeballs");
});
