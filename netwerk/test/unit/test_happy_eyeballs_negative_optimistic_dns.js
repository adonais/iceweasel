/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Optimistic DNS for negative entries, end-to-end through Happy Eyeballs
// (bug 2072592). A negative family (here A) is served from its grace period as
// a stale negative; the resolver does not refresh it, so the connection can
// only succeed if Happy Eyeballs revalidates it (a cache-bypassing refresh) and
// uses the fresh address.
//
// The other family (AAAA) resolves to an address whose connect is blocked by
// the mock network layer. That keeps A eligible to be served stale (a negative
// is only served for a high-priority query when the other family has a usable
// positive) and it means the connection cannot succeed on AAAA -- only on the
// revalidated A. The blocked address is never actually connected to, so no real
// IPv6 connectivity is required.

var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const { NodeHTTP2Server } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

const mockController = Cc[
  "@mozilla.org/network/mock-network-controller;1"
].getService(Ci.nsIMockNetworkLayerController);

const HOST = "negative-optimistic-dns.example.com";
// Working address (A), where the HTTP/2 server listens. Only reachable after
// the stale A negative is revalidated.
const FRESH_ADDR = "127.0.0.1";
// The other family (AAAA); its connect is blocked so it can't carry the request.
const BLOCKED_ADDR = "::1";
const NEG_TTL = 1; // seconds
const GRACE = 600; // seconds

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

add_setup(async function setup() {
  trr_test_setup();
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  Services.prefs.setBoolPref("network.socket.attach_mock_network_layer", true);
  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setIntPref("network.dnsNegativeCacheExpiration", NEG_TTL);
  Services.prefs.setIntPref(
    "network.dnsNegativeCacheExpirationGracePeriod",
    GRACE
  );

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
  // AAAA is a usable-but-unreachable positive: it keeps the A negative eligible
  // to be served stale, and its connect is blocked below.
  await trrServer.registerDoHAnswers(HOST, "AAAA", {
    answers: [
      { name: HOST, ttl: 55, type: "AAAA", flush: false, data: BLOCKED_ADDR },
    ],
  });
  mockController.blockTCPConnect(
    mockController.createScriptableNetAddr(BLOCKED_ADDR, originPort)
  );

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.socket.attach_mock_network_layer");
    Services.prefs.clearUserPref("network.trr.mode");
    Services.prefs.clearUserPref("network.trr.uri");
    Services.prefs.clearUserPref("network.dnsNegativeCacheExpiration");
    Services.prefs.clearUserPref(
      "network.dnsNegativeCacheExpirationGracePeriod"
    );
    trr_clear_prefs();
    mockController.clearBlockedTCPConnect();
    try {
      await trrServer.stop();
      await server.stop();
    } catch (e) {
      info("Error stopping servers: " + e);
    }
  });
});

add_task(async function test_stale_negative_revalidated_by_happy_eyeballs() {
  // Seed a negative A entry: A resolves to nothing and AAAA's connect is
  // blocked, so the request fails and a negative A record is cached.
  await trrServer.registerDoHAnswers(HOST, "A", { answers: [] });
  let seed = await openChan(true);
  Assert.equal(
    seed.status,
    Cr.NS_ERROR_CONNECTION_REFUSED,
    "seeding request fails: A has no address and the AAAA connect is refused"
  );

  // A now has a working address, reachable only if the stale negative is
  // revalidated by Happy Eyeballs.
  await trrServer.registerDoHAnswers(HOST, "A", {
    answers: [
      { name: HOST, ttl: 55, type: "A", flush: false, data: FRESH_ADDR },
    ],
  });

  // Age the negative A entry past its TTL into its grace period.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, NEG_TTL * 1000 + 200));

  let req = await openChan(false);
  Assert.equal(
    req.QueryInterface(Ci.nsIHttpChannel).responseStatus,
    200,
    "request succeeds after Happy Eyeballs revalidates the stale A negative"
  );
  Assert.equal(
    req.QueryInterface(Ci.nsIHttpChannelInternal).remoteAddress,
    FRESH_ADDR,
    "connected to the revalidated A address"
  );
});
