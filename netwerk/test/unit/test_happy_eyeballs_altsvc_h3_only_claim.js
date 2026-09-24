/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Bug 2063452: eager Alt-Svc h3 validation marks its conn info Http3Only, so
// Happy Eyeballs races h3 with no TCP leg. While that attempt shared the
// origin's ConnectionEntry, a normal transaction could claim a race that can
// never fall back, and the pending UDP attempt held the entry's single-H3 slot,
// pinning the origin to one connection.
//
// The advertised alternate is the h3 server's no-response port: it accepts UDP
// and never replies, like the UDP-blocking proxy in the report.

const { NodeHTTPSServer, NodeHTTP2Server, HTTP3Server } =
  ChromeUtils.importESModule("resource://testing-common/NodeServer.sys.mjs");

const { setTimeout, clearTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

let originServer;
let h2Server;
let h3Server;
let h3ServerPath;
let h3DBPath;
let reachableOriginServer;
let noCoalesceOriginServer;
let blackHoleAltSvc;
let reachableAltSvc;

const CLOSE_PATH = "/altsvc-h3-close";
const KEEPALIVE_PATH = "/altsvc-h3-keepalive";
const REACHABLE_PATH = "/altsvc-h3-reachable";

const VALIDATION_ATTEMPTS = 20;
const VALIDATION_POLL_MS = 100;
// net:cancel-all-connections completes on the socket thread.
const CONNECTION_CLOSE_WAIT_MS = 500;

const FOLLOW_UP_COUNT = 3;
const CONCURRENT_COUNT = 8;
// A poisoned transaction never completes; fail by assertion, not by timeout.
const REQUEST_DEADLINE_MS = 5000;
// Hold each response open so concurrent requests overlap on the server.
const RESPONSE_DELAY_MS = 400;

add_setup(async function () {
  h3ServerPath = Services.env.get("MOZ_HTTP3_SERVER_PATH");
  h3DBPath = Services.env.get("MOZ_HTTP3_CERT_DB_PATH");

  do_get_profile();

  Services.prefs.setBoolPref("network.http.http3.enable", true);
  Services.prefs.setCharPref(
    "network.dns.localDomains",
    "foo.example.com,alt2.example.com"
  );
  Services.prefs.setBoolPref("network.proxy.allow_hijacking_localhost", true);
  Services.prefs.setBoolPref("network.dns.disableIPv6", true);
  // Eager Alt-Svc validation goes through SpeculativeConnect.
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 20);

  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  addCertFromFile(certdb, "http2-ca.pem", "CTu,u,u");

  originServer = new NodeHTTPSServer();
  await originServer.start();

  // Connection: close, so every follow-up request needs a new connection.
  await originServer.registerPathHandler(CLOSE_PATH, (req, resp) => {
    resp.writeHead(200, {
      "Content-Type": "text/plain",
      "Alt-Svc": "h3=" + req.headers["x-altsvc"],
      Connection: "close",
    });
    resp.end("a".repeat(100));
  });

  await originServer.registerPathHandler(KEEPALIVE_PATH, keepAliveHandler);

  // The reported origin spoke HTTP/1.1 because the proxy downgraded ALPN; run
  // the same scenario against a multiplexed origin for comparison.
  h2Server = new NodeHTTP2Server();
  await h2Server.start();
  await h2Server.registerPathHandler(KEEPALIVE_PATH, keepAliveHandler);

  // Each origin below listens on its own port, which is what keeps their
  // alt-svc entries independent.
  reachableOriginServer = new NodeHTTPSServer();
  await reachableOriginServer.start();
  await reachableOriginServer.registerPathHandler(
    REACHABLE_PATH,
    reachableHandler
  );

  noCoalesceOriginServer = new NodeHTTPSServer();
  await noCoalesceOriginServer.start();
  await noCoalesceOriginServer.registerPathHandler(
    REACHABLE_PATH,
    reachableHandler
  );

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.http.http2.coalesce-hostnames");
    Services.prefs.clearUserPref("network.http.http3.enable");
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.dns.localDomains");
    Services.prefs.clearUserPref("network.proxy.allow_hijacking_localhost");
    Services.prefs.clearUserPref("network.dns.disableIPv6");
    Services.prefs.clearUserPref("network.http.speculative-parallel-limit");
    if (originServer) {
      await originServer.stop();
    }
    if (h2Server) {
      await h2Server.stop();
    }
    if (reachableOriginServer) {
      await reachableOriginServer.stop();
    }
    if (noCoalesceOriginServer) {
      await noCoalesceOriginServer.stop();
    }
    if (h3Server) {
      await h3Server.stop();
    }
  });
});

// Both handlers are serialized into the node process with toString(), so they
// must be self-contained: state lives on `global` and the advertised alternate
// arrives in the x-altsvc request header.
function reachableHandler(req, resp) {
  resp.writeHead(200, {
    "Content-Type": "text/plain",
    "Alt-Svc": "h3=" + req.headers["x-altsvc"],
  });
  resp.end("a".repeat(100));
}

function keepAliveHandler(req, resp) {
  global.inFlight = (global.inFlight || 0) + 1;
  global.maxInFlight = Math.max(global.maxInFlight || 0, global.inFlight);
  global.sockets = global.sockets || new Set();
  global.sockets.add(req.socket);
  // Runs in the node process, not in Gecko.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  setTimeout(() => {
    global.inFlight--;
    resp.writeHead(200, {
      "Content-Type": "text/plain",
      "Alt-Svc": "h3=" + req.headers["x-altsvc"],
    });
    resp.end("a".repeat(100));
  }, global.responseDelayMs);
}

async function startH3Server() {
  if (h3Server) {
    await h3Server.stop();
    h3Server = null;
  }
  h3Server = new HTTP3Server();
  await h3Server.start(h3ServerPath, h3DBPath);

  let noResponsePort = h3Server.no_response_port();
  Assert.ok(
    !!noResponsePort,
    "the h3 server must expose a no-response port for this test"
  );
  blackHoleAltSvc = ":" + noResponsePort;
  reachableAltSvc = ":" + h3Server.port();
}

// Every task counts connections, so start each one from an empty pool.
async function closeAllConnections() {
  Services.obs.notifyObservers(null, "net:cancel-all-connections");
  await wait(CONNECTION_CLOSE_WAIT_MS);
}

function wait(ms) {
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeChan(uri, altSvc = blackHoleAltSvc) {
  let chan = NetUtil.newChannel({
    uri,
    loadUsingSystemPrincipal: true,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_DOCUMENT,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.loadFlags = Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;
  chan.setRequestHeader("x-altsvc", altSvc, false);
  return chan;
}

function channelProtocol(request) {
  try {
    return request.protocolVersion;
  } catch (e) {
    return "";
  }
}

// Never rejects: a failed request resolves with its status, and one that stalls
// past REQUEST_DEADLINE_MS is cancelled and resolves with timedOut set.
function requestOnce(uri, altSvc = blackHoleAltSvc) {
  return new Promise(resolve => {
    let chan = makeChan(uri, altSvc);
    let timedOut = false;
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    let timer = setTimeout(() => {
      timedOut = true;
      chan.cancel(Cr.NS_BINDING_ABORTED);
    }, REQUEST_DEADLINE_MS);

    chan.asyncOpen({
      QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
      onStartRequest() {},
      onDataAvailable(request, stream, off, cnt) {
        read_stream(stream, cnt);
      },
      onStopRequest(request, status) {
        clearTimeout(timer);
        let responseStatus = 0;
        try {
          responseStatus = request.QueryInterface(
            Ci.nsIHttpChannel
          ).responseStatus;
        } catch (e) {}
        resolve({
          status,
          responseStatus,
          protocol: channelProtocol(request),
          timedOut,
        });
      },
    });
  });
}

function assertServedOverTcp(result, label, expectedProtocol = "http/1.1") {
  Assert.ok(
    !result.timedOut,
    `${label}: completed instead of hanging on an h3-only race`
  );
  Assert.ok(
    Components.isSuccessCode(result.status),
    `${label}: succeeded, got 0x${result.status.toString(16)}`
  );
  Assert.equal(result.responseStatus, 200, `${label}: response status`);
  Assert.equal(
    result.protocol,
    expectedProtocol,
    `${label}: served over TCP as ${expectedProtocol}`
  );
}

// Every follow-up needs a new connection and so reaches FindConnToClaim.
// Whichever transaction claims the h3-only attempt inherits a race with no TCP
// endpoint and hangs.
async function doClaimTest(host) {
  let uri = `https://${host}:${originServer.port()}${CLOSE_PATH}`;

  // Brings back Alt-Svc: h3, starting validation of the black-hole alternate.
  let first = await requestOnce(uri);
  info(
    `first request: status=0x${first.status.toString(16)} protocol=${first.protocol}`
  );
  assertServedOverTcp(first, "first request");

  // Several attempts: the speculative attempt may not be in the pool yet.
  for (let i = 0; i < FOLLOW_UP_COUNT; i++) {
    let result = await requestOnce(uri);
    info(
      `follow-up #${i}: status=0x${result.status.toString(16)} protocol=${result.protocol} timedOut=${result.timedOut}`
    );
    assertServedOverTcp(result, `follow-up #${i}`);
    if (result.timedOut || !Components.isSuccessCode(result.status)) {
      // Already failed; don't spend another deadline.
      return;
    }
  }
}

// The shape the report shows: one reusable connection with several requests
// queued behind it while an unconnected UDP attempt sits in the entry's pool.
async function doWedgeTest(server, host, expectedProtocol = "http/1.1") {
  let uri = `https://${host}:${server.port()}${KEEPALIVE_PATH}`;

  await server.execute(
    `global.responseDelayMs = ${RESPONSE_DELAY_MS};
     global.inFlight = 0;
     global.maxInFlight = 0;
     global.sockets = new Set();`
  );

  // Establishes the reusable connection and starts eager validation.
  let warmup = await requestOnce(uri);
  info(
    `warm-up: status=0x${warmup.status.toString(16)} protocol=${warmup.protocol}`
  );
  assertServedOverTcp(warmup, "warm-up", expectedProtocol);

  // Let the speculative attempt land in the pool before piling on.
  await wait(200);

  // Only count the concurrent batch, not the warm-up.
  await server.execute("global.maxInFlight = 0; global.sockets = new Set();");

  let results = await Promise.all(
    Array.from({ length: CONCURRENT_COUNT }, (_, i) =>
      requestOnce(`${uri}?n=${i}`)
    )
  );

  let maxInFlight = await server.execute("global.maxInFlight");
  let connections = await server.execute("global.sockets.size");
  info(
    `origin saw ${connections} connection(s), at most ${maxInFlight} of ` +
      `${CONCURRENT_COUNT} requests in flight at once`
  );

  results.forEach((result, i) => {
    info(
      `concurrent #${i}: status=0x${result.status.toString(16)} protocol=${result.protocol} timedOut=${result.timedOut}`
    );
    assertServedOverTcp(result, `concurrent #${i}`, expectedProtocol);
  });

  // Exactly 1 under the bug. maxInFlight is only logged, never asserted: it
  // needs the handshakes to beat RESPONSE_DELAY_MS, which a loaded machine will
  // not do. The socket count does not depend on response timing, because the
  // manager opens connections as soon as the batch is queued. For h2, req.socket
  // is a per-stream proxy so the count means nothing; those callers assert on
  // the server's session count instead.
  if (expectedProtocol != "h2") {
    Assert.greater(
      connections,
      1,
      "a pending h3-only attempt must not pin the origin to one connection"
    );
  }

  return { maxInFlight, connections };
}

// An h2 origin should be served by exactly one session, whatever the h3-only
// attempt is doing.
async function doH2WedgeTest(host) {
  let before = await h2Server.sessionCount();
  await doWedgeTest(h2Server, host, "h2");
  let after = await h2Server.sessionCount();
  info(`h2 sessions used: ${after - before}`);
  Assert.equal(after - before, 1, "h2 origin used a single session");
}

// Giving the h3-only conn info its own entry must not quietly disable eager
// validation: a reachable alternate still has to validate and then be used.
async function doReachableAltSvcTest(server, host) {
  let uri = `https://${host}:${server.port()}${REACHABLE_PATH}`;

  let first = await requestOnce(uri, reachableAltSvc);
  info(
    `reachable first request: status=0x${first.status.toString(16)} protocol=${first.protocol}`
  );
  assertServedOverTcp(first, "reachable first request");

  // Validation is asynchronous; the mapping is used once marked validated.
  let result = first;
  for (let i = 0; i < VALIDATION_ATTEMPTS; i++) {
    await wait(VALIDATION_POLL_MS);
    result = await requestOnce(uri, reachableAltSvc);
    info(
      `reachable retry #${i}: status=0x${result.status.toString(16)} protocol=${result.protocol}`
    );
    if (result.protocol == "h3") {
      break;
    }
  }

  Assert.ok(!result.timedOut, "reachable alternate: request completed");
  Assert.ok(
    Components.isSuccessCode(result.status),
    `reachable alternate: succeeded, got 0x${result.status.toString(16)}`
  );
  Assert.equal(
    result.protocol,
    "h3",
    "a reachable h3 alternate is still validated and used"
  );
}

// Eager validation must still work end to end after the entry split.
add_task(async function test_reachable_h3_alternate_still_validates() {
  await closeAllConnections();
  await startH3Server();
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  await doReachableAltSvcTest(reachableOriginServer, "foo.example.com");
});

// With coalescing off, nothing can bridge the two entries, so without the
// handover in ProcessUDPConn the validated alternate is never used.
add_task(async function test_reachable_h3_alternate_without_coalescing() {
  await closeAllConnections();
  await startH3Server();
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  Services.prefs.setBoolPref("network.http.http2.coalesce-hostnames", false);
  await doReachableAltSvcTest(noCoalesceOriginServer, "foo.example.com");
  Services.prefs.clearUserPref("network.http.http2.coalesce-hostnames");
});

// An h2 transaction is dispatched off the existing session in step 0 of
// TryDispatchTransaction, so it never reaches the poisoned paths. Ordered
// before the HTTP/1.1 cases because xpcshell stops at the first failing task.
add_task(async function test_h2_origin_is_unaffected() {
  await closeAllConnections();
  await startH3Server();
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  await doH2WedgeTest("alt2.example.com");
});

// The reported shape: a pending h3-only attempt must not hold the entry's
// single-H3 slot and serialize every request onto one connection.
add_task(async function test_h3_only_attempt_must_not_wedge_conn_limit() {
  await closeAllConnections();
  await startH3Server();
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  await doWedgeTest(originServer, "alt2.example.com");
});

// The same bug without the concurrency: the next request takes the claim path.
add_task(async function test_h3_only_attempt_must_not_break_tcp_fallback() {
  await closeAllConnections();
  await startH3Server();
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  await doClaimTest("foo.example.com");
});
