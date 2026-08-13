/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Regression test for bug 2050384. An HTTP/3 connection that becomes unusable
// (e.g. DontReuse'd) but lingers in the entry's active connections must not
// keep the single-HTTP/3-per-entry slot: otherwise GetH2orH3ActiveConn skips
// it (so it can't serve the request) while AtActiveConnectionLimit still counts
// it (so no replacement is created), and the pending transaction is wedged
// forever.
//
// We reproduce the "unusable but still active" h3 connection with the
// network.http.http3.force_cannot_reuse_for_testing pref, which forces
// HttpConnectionUDP::CanReuse() to return false. With the fix a second request
// creates a fresh h3 connection and completes; without it the second request
// hangs.

"use strict";

var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const { NodeHTTP2Server } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

const { HTTP3Server } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

const override = Cc["@mozilla.org/network/native-dns-override;1"].getService(
  Ci.nsINativeDNSResolverOverride
);

const mockController = Cc[
  "@mozilla.org/network/mock-network-controller;1"
].getService(Ci.nsIMockNetworkLayerController);

let h3Port;
let h3Server;
let h2Server;
let h3ServerPath;
let h3DBPath;

async function startH3Server() {
  h3Server = new HTTP3Server();
  await h3Server.start(h3ServerPath, h3DBPath);
  h3Port = h3Server.port();
}

async function stopH3Server() {
  if (h3Server) {
    await h3Server.stop();
    h3Server = null;
  }
}

add_setup(async function () {
  h3ServerPath = Services.env.get("MOZ_HTTP3_SERVER_PATH");
  h3DBPath = Services.env.get("MOZ_HTTP3_CERT_DB_PATH");

  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  addCertFromFile(certdb, "http2-ca.pem", "CTu,u,u");

  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  Services.prefs.setBoolPref("network.http.http3.enable", true);
  Services.prefs.setBoolPref("network.socket.attach_mock_network_layer", true);
  // Avoid speculative connections adding extra attempts to the entry.
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 0);

  h2Server = new NodeHTTP2Server();
  await h2Server.start();
  await h2Server.registerPathHandler("/", (_req, resp) => {
    resp.writeHead(200, { "Content-Type": "text/plain" });
    resp.end("ok");
  });

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.http.http3.enable");
    Services.prefs.clearUserPref("network.socket.attach_mock_network_layer");
    Services.prefs.clearUserPref("network.http.speculative-parallel-limit");
    Services.prefs.clearUserPref(
      "network.http.http3.alt-svc-mapping-for-testing"
    );
    Services.prefs.clearUserPref(
      "network.http.http3.force_cannot_reuse_for_testing"
    );
    override.clearOverrides();
    mockController.clearBlockedTCPConnect();
    if (h2Server) {
      await h2Server.stop();
    }
    await stopH3Server();
  });
});

async function resetConnections() {
  Services.obs.notifyObservers(null, "net:cancel-all-connections");
  Services.obs.notifyObservers(null, "browser:purge-session-history");
  let nssComponent = Cc["@mozilla.org/network/ssl-tokens-cache;1"].getService(
    Ci.nsISSLTokensCache
  );
  await nssComponent.asyncClearSSLExternalAndInternalSessionCache();
  Services.dns.clearCache(true);
  override.clearOverrides();
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function openChan(uri) {
  let chan = NetUtil.newChannel({
    uri,
    loadUsingSystemPrincipal: true,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.loadFlags = Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;

  let result = await new Promise(resolve => {
    chan.asyncOpen(
      new ChannelListener(
        (r, b) => resolve({ req: r, buffer: b }),
        null,
        CL_ALLOW_UNKNOWN_CL
      )
    );
  });

  return {
    httpVersion: result.req.protocolVersion,
    status: result.req.QueryInterface(Ci.nsIHttpChannel).responseStatus,
    buffer: result.buffer,
  };
}

add_task(async function test_unusable_h3_conn_does_not_wedge_entry() {
  await startH3Server();
  await resetConnections();
  mockController.clearBlockedTCPConnect();

  let host = "foo.example.com";
  override.addIPOverride(host, "127.0.0.1");
  Services.prefs.setCharPref(
    "network.http.http3.alt-svc-mapping-for-testing",
    `${host};h3=:${h3Port}`
  );

  // Block TCP so the H2 fallback cannot win the race against H3, i.e. the
  // request is served over an HTTP/3 connection.
  let blockedTCP = mockController.createScriptableNetAddr(
    "127.0.0.1",
    h2Server.port()
  );
  mockController.blockTCPConnect(blockedTCP);

  // First request establishes an active HTTP/3 connection on the entry.
  let first = await openChan(`https://${host}:${h2Server.port()}/`);
  Assert.equal(first.status, 200, "First request should succeed");
  Assert.equal(first.httpVersion, "h3", "First request should use HTTP/3");

  // Make the established HTTP/3 connection unusable while it stays in the
  // entry's active connections (mirroring a DontReuse'd connection that hasn't
  // been reaped).
  Services.prefs.setBoolPref(
    "network.http.http3.force_cannot_reuse_for_testing",
    true
  );

  // The second request cannot reuse the now-unusable connection, so it must be
  // able to create a fresh HTTP/3 connection. Before the fix it hangs, because
  // the unusable connection still counts against the single-HTTP/3-per-entry
  // limit and blocks a replacement.
  let second = await openChan(`https://${host}:${h2Server.port()}/`);
  Assert.equal(
    second.status,
    200,
    "Second request should succeed on a new HTTP/3 connection"
  );
  Assert.equal(second.httpVersion, "h3", "Second request should use HTTP/3");

  Services.prefs.clearUserPref(
    "network.http.http3.force_cannot_reuse_for_testing"
  );
  mockController.clearBlockedTCPConnect();
  await stopH3Server();
});
