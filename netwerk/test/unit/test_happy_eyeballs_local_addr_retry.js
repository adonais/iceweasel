/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// A speculative Happy Eyeballs attempt refuses a local (RFC1918) peer. When a
// real transaction claims that attempt the restriction no longer applies and
// the connection must be retried instead of being stranded.
//
// The host resolves to an RFC1918 address (so the speculative attempt refuses
// it), and the mock network layer routes that address to the loopback test
// server so the retried connection can succeed.

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

// A host whose cert (http2-ca signed) is valid, resolved to a local address.
const HOST = "alt1.example.com";
const LOCAL_IP = "10.0.0.2";

let server;
let serverPort;

add_setup(async function () {
  do_get_profile();

  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  addCertFromFile(certdb, "http2-ca.pem", "CTu,u,u");

  Services.prefs.setBoolPref("network.http.http2.enabled", true);
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  // Keep it single-family (one local address) so the whole attempt is a local
  // refusal.
  Services.prefs.setBoolPref("network.dns.disableIPv6", true);
  // Ensure a speculative connect is issued in parallel with the real request.
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 6);
  // Route the mock connect for the local address to the loopback server.
  Services.prefs.setBoolPref("network.socket.attach_mock_network_layer", true);

  server = new NodeHTTP2Server();
  await server.start();
  await server.registerPathHandler("/local", (_req, resp) => {
    let body = "ok";
    resp.writeHead(200, {
      "Content-Type": "text/plain",
      "Content-Length": "" + body.length,
    });
    resp.end(body);
  });
  serverPort = server.port();

  override.addIPOverride(HOST, LOCAL_IP);
  let from = mockController.createScriptableNetAddr(LOCAL_IP, serverPort);
  let to = mockController.createScriptableNetAddr("127.0.0.1", serverPort);
  mockController.addNetAddrOverride(from, to);

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.http.http2.enabled");
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.dns.disableIPv6");
    Services.prefs.clearUserPref("network.http.speculative-parallel-limit");
    Services.prefs.clearUserPref("network.socket.attach_mock_network_layer");
    override.clearOverrides();
    mockController.clearNetAddrOverrides();
    await server.stop();
  });
});

function openChan(path) {
  let chan = NetUtil.newChannel({
    uri: `https://${HOST}:${serverPort}${path}`,
    loadUsingSystemPrincipal: true,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_DOCUMENT,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.loadFlags = Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;

  return new Promise(resolve => {
    chan.asyncOpen({
      onStartRequest() {},
      onDataAvailable(req, stream, offset, count) {
        read_stream(stream, count);
      },
      onStopRequest(req) {
        let httpVersion = "";
        try {
          httpVersion = req.protocolVersion;
        } catch (e) {}
        resolve({ status: req.status, httpVersion });
      },
    });
  });
}

add_task(async function test_local_address_retry_after_claim() {
  Services.dns.clearCache(true);
  Services.obs.notifyObservers(null, "net:cancel-all-connections");

  // Warm a speculative connection to the local host: the speculative attempt
  // refuses the RFC1918 peer. Then a real request claims that attempt.
  Services.io.speculativeConnect(
    Services.io.newURI(`https://${HOST}:${serverPort}/`),
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    false
  );

  let result = await Promise.race([
    openChan("/local"),
    new Promise(resolve =>
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      setTimeout(() => resolve({ status: "TIMEOUT" }), 15000)
    ),
  ]);

  info(`status=${result.status} httpVersion=${result.httpVersion}`);
  Assert.ok(
    Components.isSuccessCode(result.status),
    "request to a local-address host succeeds after the speculative attempt " +
      "refused it and the real transaction claimed it"
  );
  Assert.equal(result.httpVersion, "h2", "connected over h2 to the local host");
});
