/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Regression test for the Alt-Svc + SOCKS remote-DNS proxy DNS leak.
//
// With a manual SOCKS proxy that resolves hostnames itself
// (TRANSPARENT_PROXY_RESOLVES_HOST, i.e. the "remote DNS" anonymity config),
// Firefox must never resolve a hostname client-side. Receiving an Alt-Svc
// header on a proxied HTTPS response used to force Happy Eyeballs on the
// (proxied) validation connection info, which resolved the alternate hostname
// via the native OS resolver (getaddrinfo) -- leaking it outside the proxy --
// even though the exact-key/GetConnectionInfo paths correctly leave Happy
// Eyeballs off when a proxy is present. The alternate's name resolution must
// stay inside the proxy.

const { NodeHTTP2Server, NodeSocks5ForwardServer } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

const gDashboard = Cc["@mozilla.org/network/dashboard;1"].getService(
  Ci.nsIDashboard
);
const pps = Cc["@mozilla.org/network/protocol-proxy-service;1"].getService();
const override = Cc["@mozilla.org/network/native-dns-override;1"].getService(
  Ci.nsINativeDNSResolverOverride
);

const ORIGIN_HOST = "origin.altsvc-proxy.example";
const ALT_HOST = "alt.altsvc-proxy.example";
const ORIGIN_PATH = "/altsvc-proxy-dns";

let originServer = new NodeHTTP2Server();
// The alternate serves the origin's cert so the validation TLS handshake
// completes if a connection is attempted.
let altServer = new NodeHTTP2Server();
let socksServer = new NodeSocks5ForwardServer();
let originURL;
let gFilter;

// Routes every Firefox channel through the SOCKS5 remote-DNS proxy.
class SocksRemoteDnsFilter {
  constructor(port) {
    this._port = port;
    this.QueryInterface = ChromeUtils.generateQI(["nsIProtocolProxyFilter"]);
  }
  applyFilter(uri, pi, cb) {
    cb.onProxyFilterResult(
      pps.newProxyInfo(
        "socks",
        "127.0.0.1",
        this._port,
        "",
        "",
        Ci.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST,
        1000,
        null
      )
    );
  }
}

function makeChan(url) {
  let uri = NetUtil.newURI(url);
  let principal = Services.scriptSecurityManager.createContentPrincipal(
    uri,
    {}
  );
  let chan = NetUtil.newChannel({
    uri: url,
    loadingPrincipal: principal,
    triggeringPrincipal: principal,
    securityFlags: Ci.nsILoadInfo.SEC_REQUIRE_SAME_ORIGIN_INHERITS_SEC_CONTEXT,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
  }).QueryInterface(Ci.nsIHttpChannel);
  return chan;
}

// Resolves on completion regardless of success/failure.
function fetchOrigin() {
  let chan = makeChan(originURL);
  return new Promise(resolve => {
    let listener = {
      QueryInterface: ChromeUtils.generateQI([
        "nsIStreamListener",
        "nsIRequestObserver",
      ]),
      onStartRequest() {},
      onDataAvailable(req, stream, off, cnt) {
        read_stream(stream, cnt);
      },
      onStopRequest(req, status) {
        resolve(status);
      },
    };
    chan.asyncOpen(listener);
  });
}

function altHasDnsEntry() {
  return new Promise(resolve => {
    gDashboard.requestDNSInfo(data => {
      resolve(data.entries.some(e => e.hostname == ALT_HOST));
    });
  });
}

add_setup(async function setup() {
  do_get_profile();

  Services.prefs.setBoolPref("network.http.http2.enabled", true);
  Services.prefs.setBoolPref("network.http.altsvc.enabled", true);
  Services.prefs.setBoolPref("network.http.altsvc.oe", true);
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  Services.prefs.setBoolPref("network.proxy.allow_hijacking_localhost", true);

  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  addCertFromFile(certdb, "http2-ca.pem", "CTu,u,u");

  await originServer.start(0, [ORIGIN_HOST]);
  await altServer.start(0, [ORIGIN_HOST, ALT_HOST]);
  await socksServer.start();

  let originPort = originServer.port();
  let altPort = altServer.port();
  originURL = `https://${ORIGIN_HOST}:${originPort}${ORIGIN_PATH}`;

  // Detection: if (buggy) the client resolves the alternate itself, the
  // override is consulted and an ALT_HOST entry appears in the DNS cache. If
  // (fixed) resolution stays inside the proxy, the override is never consulted
  // and no entry appears. The proxy forwards any hostname to loopback, so no
  // client-side override is needed for connectivity.
  override.addIPOverride(ALT_HOST, "127.0.0.1");

  let altSvc = `h2="${ALT_HOST}:${altPort}"; ma=3600`;
  await originServer.execute(`global.ALT_SVC = ${JSON.stringify(altSvc)}`);
  await originServer.registerPathHandler(ORIGIN_PATH, (req, resp) => {
    resp.setHeader("Alt-Svc", global.ALT_SVC);
    resp.writeHead(200, {
      "Content-Type": "text/plain",
      "Content-Length": "6",
    });
    resp.end("origin");
  });
  await altServer.registerPathHandler(ORIGIN_PATH, (req, resp) => {
    resp.writeHead(200, {
      "Content-Type": "text/plain",
      "Content-Length": "3",
    });
    resp.end("ALT");
  });

  gFilter = new SocksRemoteDnsFilter(socksServer.port());
  pps.registerFilter(gFilter, 10);

  registerCleanupFunction(async () => {
    pps.unregisterFilter(gFilter);
    try {
      await originServer.stop();
      await altServer.stop();
      await socksServer.stop();
    } catch (e) {
      info("Error stopping servers: " + e);
    }
    Services.prefs.clearUserPref("network.http.http2.enabled");
    Services.prefs.clearUserPref("network.http.altsvc.enabled");
    Services.prefs.clearUserPref("network.http.altsvc.oe");
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.proxy.allow_hijacking_localhost");
    override.clearOverrides();
    Services.dns.clearCache(true);
  });
});

add_task(async function altsvc_over_socks_must_not_leak_dns() {
  // Prime the origin and trigger Alt-Svc validation. Drop connections between
  // fetches so the alternate route is actually attempted rather than coalesced
  // onto the existing origin connection.
  await fetchOrigin();

  // Wait until the proxy has been asked to connect to the alternate host,
  // proving Alt-Svc validation actually reached the alt route (through the
  // proxy) -- otherwise a "no leak" result would be vacuous.
  let sawAltViaProxy = false;
  for (let i = 0; i < 20 && !sawAltViaProxy; i++) {
    Services.obs.notifyObservers(null, "net:cancel-all-connections");
    await new Promise(r => do_timeout(250, r));
    await fetchOrigin();
    let hosts = await socksServer.connectedHostnames();
    sawAltViaProxy = hosts.includes(ALT_HOST);
  }

  Assert.ok(
    sawAltViaProxy,
    "Alt-Svc validation should reach the alternate host via the SOCKS proxy " +
      "(remote DNS), confirming the test actually exercised the alt route"
  );

  // The core assertion: the alternate hostname must not have been resolved
  // client-side. Any resolution here escapes the SOCKS remote-DNS proxy.
  let leaked = await altHasDnsEntry();
  Assert.ok(
    !leaked,
    "Alt-Svc alternate host must NOT be resolved by the native resolver when a " +
      "SOCKS remote-DNS proxy is active (proxy-DNS bypass regression)"
  );
});
