/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const { NodeHTTP2Server, HTTP3Server } = ChromeUtils.importESModule(
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
  Services.prefs.setBoolPref("network.socket.ip_addr_any.disabled", true);
  // Required for H3 UDP to function on macOS in xpcshell tests.
  Services.prefs.setBoolPref("network.http.http3.use_nspr_for_io", true);

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
    Services.prefs.clearUserPref("network.socket.ip_addr_any.disabled");
    Services.prefs.clearUserPref("network.http.http3.use_nspr_for_io");
    Services.prefs.clearUserPref(
      "network.http.http3.alt-svc-mapping-for-testing"
    );
    Services.prefs.clearUserPref("network.http.speculative-parallel-limit");
    override.clearOverrides();
    mockController.clearPausedTCPConnect();
    mockController.clearBlockedUDPAddr();
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
  mockController.clearPausedTCPConnect();
  mockController.clearBlockedUDPAddr();
  Services.prefs.clearUserPref(
    "network.http.http3.alt-svc-mapping-for-testing"
  );
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function do_test_any_addr_refused(host, anyAddr) {
  await startH3Server();
  await resetConnections();

  override.addIPOverride(host, anyAddr);
  Services.prefs.setCharPref(
    "network.http.http3.alt-svc-mapping-for-testing",
    `${host};h3=:${h3Port}`
  );

  let h2Port = h2Server.port();
  let chan = NetUtil.newChannel({
    uri: `https://${host}:${h2Port}/`,
    loadUsingSystemPrincipal: true,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.loadFlags = Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;

  await new Promise(resolve => {
    chan.asyncOpen(
      new ChannelListener(() => resolve(), null, CL_EXPECT_FAILURE)
    );
  });

  Assert.equal(
    chan.status,
    Cr.NS_ERROR_CONNECTION_REFUSED,
    `Connection to ${anyAddr} must fail with NS_ERROR_CONNECTION_REFUSED`
  );

  await stopH3Server();
}

add_task(async function test_h3_ipv4_any_addr_refused() {
  await do_test_any_addr_refused("zeroip4.example.com", "0.0.0.0");
});

add_task(async function test_h3_ipv6_any_addr_refused() {
  await do_test_any_addr_refused("zeroip6.example.com", "::");
});
