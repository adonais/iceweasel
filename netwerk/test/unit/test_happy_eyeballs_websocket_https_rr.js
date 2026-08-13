/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Verifies that a secure WebSocket honors the port parameter from an HTTPS RR
// (Bug 2023355) when the connection is driven by Happy Eyeballs. The WebSocket
// URL uses the default port (443) but the HTTPS RR advertises the real server
// port, so the connection can only succeed if the HTTPS RR port is used. A
// real (echo) WebSocket server is used so we exercise actual data flow over the
// HTTPS-RR-routed connection, not just the opening handshake.
//
// WebSocket upgrades normally disable HTTPS RR (NS_HTTP_STICKY_CONNECTION
// breaks the restart-based HTTPS RR fallback). Happy Eyeballs races endpoints
// instead of restarting, so it can honor the HTTPS RR; this test exercises
// that path.

"use strict";

/* import-globals-from head_trr.js */
/* import-globals-from head_websocket.js */

const { NodeWebSocketHttp2Server } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

add_setup(async function setup() {
  trr_test_setup();

  Services.prefs.setBoolPref("network.http.http2.websockets", true);
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  Services.prefs.setBoolPref(
    "network.http.happy_eyeballs_upgrade_enabled",
    true
  );
  // HTTPS RR must be allowed as an alt-svc source for the port to be honored.
  Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);

  registerCleanupFunction(async () => {
    trr_clear_prefs();
    Services.prefs.clearUserPref("network.http.http2.websockets");
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.http.happy_eyeballs_upgrade_enabled");
    Services.prefs.clearUserPref("network.dns.use_https_rr_as_altsvc");
  });
});

// Opens a WebSocket, sends one message and resolves with the echoed reply.
function echoWebSocket(url, msg) {
  let chan = Cc["@mozilla.org/network/protocol;1?name=wss"].createInstance(
    Ci.nsIWebSocketChannel
  );
  // Use a content principal (as a real page-initiated WebSocket would). A
  // system principal on a non-document load disables HTTPS RR in BeginConnect.
  let principal = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI("https://alt1.example.com"),
    {}
  );
  chan.initLoadInfo(
    null, // aLoadingNode
    principal,
    principal,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_WEBSOCKET
  );

  let uri = Services.io.newURI(url);
  return new Promise((resolve, reject) => {
    let onMessage = aMsg => {
      chan.close(Ci.nsIWebSocketChannel.CLOSE_NORMAL, "");
      resolve(aMsg);
    };
    let listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIWebSocketListener"]),
      onAcknowledge() {},
      // The `ws` library echoes the data back as a binary frame.
      onBinaryMessageAvailable(aContext, aMsg) {
        onMessage(aMsg);
      },
      onMessageAvailable(aContext, aMsg) {
        onMessage(aMsg);
      },
      onServerClose() {},
      onStart() {
        chan.sendMsg(msg);
      },
      onStop(aContext, aStatusCode) {
        // Only meaningful if we never received a message (handshake or
        // connection failed); a successful run resolves in onMessageAvailable.
        reject(aStatusCode);
      },
    };
    chan.asyncOpen(uri, url, {}, 0, listener, null);
  });
}

add_task(async function test_wss_uses_https_rr_port() {
  // A real WebSocket-over-HTTP/2 echo server on its own (non-443) port.
  let wss = new NodeWebSocketHttp2Server();
  await wss.start();
  registerCleanupFunction(async () => wss.stop());
  Assert.notEqual(wss.port(), null);
  await wss.registerMessageHandler((data, ws) => {
    ws.send(data);
  });

  let trrServer = new TRRServer();
  await trrServer.start();
  registerCleanupFunction(async () => trrServer.stop());

  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );

  // Resolve alt1.example.com to localhost and advertise the real WebSocket
  // server port via the HTTPS RR. The wss:// URL below uses the default port.
  await trrServer.registerDoHAnswers("alt1.example.com", "A", {
    answers: [
      {
        name: "alt1.example.com",
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });
  await trrServer.registerDoHAnswers("alt1.example.com", "HTTPS", {
    answers: [
      {
        name: "alt1.example.com",
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: "alt1.example.com",
          values: [
            { key: "alpn", value: ["h2"] },
            { key: "port", value: wss.port() },
            { key: "ipv4hint", value: ["127.0.0.1"] },
          ],
        },
      },
    ],
  });

  Services.dns.clearCache(true);

  // Sanity check that the TRR server serves the HTTPS RR, so a connection
  // failure below is attributable to the port not being honored rather than a
  // missing record.
  let { inRecord } = await new TRRDNSListener("alt1.example.com", {
    type: Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
  });
  let records = inRecord.QueryInterface(Ci.nsIDNSHTTPSSVCRecord).records;
  Assert.equal(records.length, 1, "got the HTTPS RR");

  // Connect to the default wss port (443). With the HTTPS RR port honored the
  // connection lands on the real echo server; otherwise it would try 443 and
  // fail.
  const msg = "happy eyeballs https rr websocket";
  let echoed = await echoWebSocket("wss://alt1.example.com/", msg);
  Assert.equal(echoed, msg, "echoed message matches (connected via HTTPS RR)");

  await wss.stop();
  await trrServer.stop();
});
