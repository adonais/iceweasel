/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Bug 2051614: when Happy Eyeballs is enabled and every TRR-resolved address
// fails to connect, we should re-resolve with TRR disabled (native DNS) and
// retry -- except in TRR_ONLY mode. TRR resolves the origin to ::1, whose
// connection is blocked; native resolution points at 127.0.0.1 where a working
// H2 server lives. In TRR-first mode the request must succeed via the native
// fallback; in TRR-only mode it must hard-fail.

"use strict";

var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const { NodeHTTP2Server } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

const override = Cc["@mozilla.org/network/native-dns-override;1"].getService(
  Ci.nsINativeDNSResolverOverride
);

const mockController = Cc[
  "@mozilla.org/network/mock-network-controller;1"
].getService(Ci.nsIMockNetworkLayerController);

const HOST = "trr-connect-fallback.example.com";

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

async function resetConnections() {
  Services.obs.notifyObservers(null, "net:cancel-all-connections");
  let nssComponent = Cc["@mozilla.org/network/ssl-tokens-cache;1"].getService(
    Ci.nsISSLTokensCache
  );
  await nssComponent.asyncClearSSLExternalAndInternalSessionCache();
  override.clearOverrides();
  mockController.clearBlockedTCPConnect();
  Services.dns.clearCache(true);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
}

// Route: TRR -> 127.0.0.1 (blocked), native -> ::1 (working server).
function armFallbackRouting() {
  override.addIPOverride(HOST, "::1");
  let blocked = mockController.createScriptableNetAddr("127.0.0.1", originPort);
  mockController.blockTCPConnect(blocked);
}

add_setup(async function setup() {
  trr_test_setup(); // native-is-localhost, bootstrapAddr, skip confirmation, profile

  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  Services.prefs.setBoolPref("network.socket.attach_mock_network_layer", true);

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
    resp.end("hello");
  });

  trrServer = new TRRServer();
  await trrServer.start();
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  // TRR resolves the origin to 127.0.0.1 only; the connection to it is blocked
  // below. (An A record is used so mDnsMetadata records the TRR resolution.)
  await trrServer.registerDoHAnswers(HOST, "A", {
    answers: [
      { name: HOST, ttl: 55, type: "A", flush: false, data: "127.0.0.1" },
    ],
  });
  await trrServer.registerDoHAnswers(HOST, "AAAA", { answers: [] });

  registerCleanupFunction(async () => {
    trr_clear_prefs();
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.socket.attach_mock_network_layer");
    Services.prefs.clearUserPref("network.trr.uri");
    Services.prefs.clearUserPref("network.trr.mode");
    override.clearOverrides();
    mockController.clearBlockedTCPConnect();
    try {
      if (trrServer) {
        await trrServer.stop();
      }
      await server.stop();
    } catch (e) {
      info("Error stopping servers: " + e);
    }
  });
});

// TRR-first: the TRR-resolved address (127.0.0.1) fails to connect, so we must
// fall back to native DNS (::1) and succeed.
add_task(async function trr_first_falls_back_to_native() {
  await resetConnections();
  Services.prefs.setIntPref("network.trr.mode", 2);
  armFallbackRouting();

  let req = await openChan(false);
  Assert.ok(
    Components.isSuccessCode(req.status),
    `request should succeed via native fallback, status=0x${req.status.toString(
      16
    )}`
  );
  Assert.equal(
    req.QueryInterface(Ci.nsIHttpChannel).responseStatus,
    200,
    "should get 200 from the native server"
  );
  Assert.equal(
    req.QueryInterface(Ci.nsIHttpChannelInternal).remoteAddress,
    "::1",
    "should have connected to the native-resolved address"
  );
  Assert.ok(
    !req.QueryInterface(Ci.nsIHttpChannelInternal).isResolvedByTRR,
    "the successful connection must have used native DNS, not TRR"
  );
});

// TRR-only: native fallback is not allowed, so the request must fail.
add_task(async function trr_only_does_not_fall_back() {
  await resetConnections();
  Services.prefs.setIntPref("network.trr.mode", 3);
  armFallbackRouting();

  let req = await openChan(true);
  Assert.ok(
    !Components.isSuccessCode(req.status),
    `TRR-only request must not fall back to native, status=0x${req.status.toString(
      16
    )}`
  );
});
