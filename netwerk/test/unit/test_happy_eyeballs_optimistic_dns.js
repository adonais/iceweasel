/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Optimistic DNS: an address served from a stale (past-TTL, grace-period) cache
// entry is raced right away, and Happy Eyeballs revalidates it with its own
// cache-bypassing lookup. Here the stale address refuses the connection, so the
// request can only succeed if that revalidation happens and its address is
// raced too.
//
// Serving a stale entry also makes the resolver renew it in the background, and
// that renewal alone is enough to reach the working address: it updates the
// shared host record, and a lookup that lands after it sees the new address. So
// the revalidated answer is delayed here, which keeps the renewal from
// completing before Happy Eyeballs has consumed the stale answer and failed on
// it. TRR_ONLY mode keeps native resolution, which answers 127.0.0.1 for
// everything in TRR tests, out of the picture as well.

var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const { NodeHTTP2Server } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

const mockController = Cc[
  "@mozilla.org/network/mock-network-controller;1"
].getService(Ci.nsIMockNetworkLayerController);

const HOST = "optimistic-dns.example.com";
// The stale answer. Connecting to it is blocked, and refused instantly.
const STALE_ADDR = "127.0.0.2";
// The revalidated answer, where the HTTP/2 server listens.
const FRESH_ADDR = "127.0.0.1";
// Lifetime of the seeded answer, and the wait that ages it into the grace
// period. The revalidated answer outlives the test instead, so that it is never
// itself served stale.
const STALE_TTL_SECONDS = 1;
const STALE_WAIT_MS = STALE_TTL_SECONDS * 1000 + 100;
const FRESH_TTL_SECONDS = 55;
// How long the revalidated answer is held back. Long enough that a lookup
// served from the stale entry cannot observe it, and well short of the TRR
// request timeout in TRR_ONLY mode.
const REVALIDATION_DELAY_MS = 1000;

let trrServer;
let server;
let originURL;
let originPort;

function openChan(expectFailure) {
  let chan = NetUtil.newChannel({
    uri: originURL,
    loadUsingSystemPrincipal: true,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_DOCUMENT,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.loadFlags = Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;
  return new Promise(resolve => {
    chan.asyncOpen(
      new ChannelListener(
        req => resolve(req),
        null,
        (expectFailure ? CL_EXPECT_FAILURE : 0) | CL_ALLOW_UNKNOWN_CL
      )
    );
  });
}

function registerAnswer(addr, ttl, delay) {
  return trrServer.registerDoHAnswers(HOST, "A", {
    answers: [{ name: HOST, ttl, type: "A", flush: false, data: addr }],
    delay,
  });
}

add_setup(async function setup() {
  trr_test_setup();

  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  Services.prefs.setBoolPref("network.socket.attach_mock_network_layer", true);
  // TRR_ONLY: every answer then comes from the DoH server, which is what lets
  // the test control when the revalidated one shows up.
  Services.prefs.setIntPref("network.trr.mode", 3);

  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  addCertFromFile(certdb, "http2-ca.pem", "CTu,u,u");

  server = new NodeHTTP2Server();
  await server.start(0, [HOST]);
  originPort = server.port();
  originURL = `https://${HOST}:${originPort}/`;
  await server.registerPathHandler("/", (req, resp) => {
    resp.writeHead(200, { "Content-Type": "text/plain" });
    resp.end("ok");
  });

  trrServer = new TRRServer();
  await trrServer.start();
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  // A single address family keeps the stale answer and its revalidation
  // unambiguous.
  await trrServer.registerDoHAnswers(HOST, "AAAA", { answers: [] });

  mockController.blockTCPConnect(
    mockController.createScriptableNetAddr(STALE_ADDR, originPort)
  );

  registerCleanupFunction(async () => {
    // Turn TRR off before dropping its URI, so that nothing looks up the
    // default (non-local) resolver on the way out.
    Services.prefs.clearUserPref("network.trr.mode");
    Services.prefs.clearUserPref("network.trr.uri");
    trr_clear_prefs();
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.socket.attach_mock_network_layer");
    mockController.clearBlockedTCPConnect();
    try {
      await trrServer.stop();
      await server.stop();
    } catch (e) {
      info("Error stopping servers: " + e);
    }
  });
});

add_task(async function test_stale_answer_revalidated_and_raced() {
  // Seed the cache with the address that cannot be connected to, driving the
  // request through Happy Eyeballs so the entry is keyed exactly as the one the
  // real request below is served from.
  await registerAnswer(STALE_ADDR, STALE_TTL_SECONDS, 0);
  let seed = await openChan(true);
  Assert.equal(
    seed.status,
    Cr.NS_ERROR_CONNECTION_REFUSED,
    "seeding connection to the stale address should be refused"
  );

  // From now on the name resolves to the working address, but only for a query
  // that reaches the resolver, and only after a delay.
  await registerAnswer(FRESH_ADDR, FRESH_TTL_SECONDS, REVALIDATION_DELAY_MS);

  // Age the seeded entry past its TTL so the next lookup is served from its
  // grace period.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, STALE_WAIT_MS));

  let req = await openChan(false);
  Assert.equal(
    req.QueryInterface(Ci.nsIHttpChannel).responseStatus,
    200,
    "request should succeed on the revalidated address"
  );
  Assert.equal(
    req.QueryInterface(Ci.nsIHttpChannelInternal).remoteAddress,
    FRESH_ADDR,
    "should have connected to the revalidated address, not the stale one"
  );
});
