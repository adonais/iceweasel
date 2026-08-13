"use strict";

// Regression test for the Alt-Svc + Local Network Access (LNA) bypass: a public
// origin must not use Alt-Svc to steer same-origin requests to a Private
// alternate without an LNA grant. The same-origin LNA exemption applies only to
// a direct connection to the origin, not to an Alt-Svc reroute.
//
// The origin is "public" and advertises an h2 alternate that is "private" (both
// loopback, faked via the address-space overrides); with LNA blocking on and
// the prompt denied, the alternate must never receive the request.

const { NodeHTTP2Server } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

const override = Cc["@mozilla.org/network/native-dns-override;1"].getService(
  Ci.nsINativeDNSResolverOverride
);

const ORIGIN_HOST = "foo.example.com";
const ALT_HOST = "alt.example.com";
const ORIGIN_PATH = "/altsvc-lna";

let originServer = new NodeHTTP2Server();
// The alternate serves the origin's cert so TLS completes and the LNA check
// (not a cert failure) is what must reject it.
let altServer = new NodeHTTP2Server();
let originURL;
let altRoute;

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
  // The initiating context lives in the public address space.
  chan.loadInfo.parentIpAddressSpace = Ci.nsILoadInfo.Public;
  return chan;
}

// Resolves on completion regardless of success/failure; we only care whether
// the private alternate was contacted.
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

async function altOriginHits() {
  let json = await altServer.execute(
    `JSON.stringify((global.altHits || []).filter(h => h.path === "${ORIGIN_PATH}"))`
  );
  return JSON.parse(json);
}

add_setup(async function setup() {
  do_get_profile();

  Services.prefs.setBoolPref("network.http.http2.enabled", true);
  Services.prefs.setBoolPref("network.http.altsvc.enabled", true);
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  Services.prefs.setCharPref(
    "network.dns.localDomains",
    `${ORIGIN_HOST},${ALT_HOST}`
  );
  Services.prefs.setBoolPref("network.proxy.allow_hijacking_localhost", true);

  // LNA on, blocking on, prompt denied: an unexempted Public->Private crossing
  // is refused.
  Services.prefs.setBoolPref("network.lna.enabled", true);
  Services.prefs.setBoolPref("network.lna.blocking", true);
  Services.prefs.setBoolPref("network.localnetwork.prompt.testing", true);
  Services.prefs.setBoolPref(
    "network.localnetwork.prompt.testing.allow",
    false
  );
  Services.prefs.setBoolPref("network.loopback-network.prompt.testing", true);
  Services.prefs.setBoolPref(
    "network.loopback-network.prompt.testing.allow",
    false
  );
  Services.prefs.setBoolPref(
    "network.lna.local-network-to-localhost.skip-checks",
    false
  );
  // Check Private targets pre-TLS (at Activate) instead of after the handshake,
  // so the block is deterministic rather than racing request dispatch.
  Services.prefs.setBoolPref("network.lna.defer_https_check", false);

  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  addCertFromFile(certdb, "http2-ca.pem", "CTu,u,u");

  await originServer.start(0, [ORIGIN_HOST]);
  await altServer.start(0, [ORIGIN_HOST, ALT_HOST]);
  let originPort = originServer.port();
  let altPort = altServer.port();
  originURL = `https://${ORIGIN_HOST}:${originPort}${ORIGIN_PATH}`;
  altRoute = `${ALT_HOST}:${altPort}`;

  override.addIPOverride(ORIGIN_HOST, "127.0.0.1");
  override.addIPOverride(ALT_HOST, "127.0.0.1");

  // Fake the address spaces on loopback: origin Public, alternate Private
  // (::1 included in case Happy Eyeballs uses IPv6).
  Services.prefs.setCharPref(
    "network.lna.address_space.public.override",
    `127.0.0.1:${originPort},::1:${originPort}`
  );
  Services.prefs.setCharPref(
    "network.lna.address_space.private.override",
    `127.0.0.1:${altPort},::1:${altPort}`
  );

  let altSvc = `h2="${altRoute}"; ma=3600`;
  await originServer.execute(`global.ALT_SVC = ${JSON.stringify(altSvc)}`);
  await originServer.registerPathHandler(ORIGIN_PATH, (req, resp) => {
    resp.setHeader("Alt-Svc", global.ALT_SVC);
    resp.setHeader("Set-Cookie", "lna=secret; Path=/");
    resp.writeHead(200, {
      "Content-Type": "text/plain",
      "Content-Length": "6",
    });
    resp.end("origin");
  });

  await altServer.execute(`global.altHits = []`);
  await altServer.registerPathHandler(ORIGIN_PATH, (req, resp) => {
    global.altHits.push({
      path: new URL(req.url, "https://x").pathname,
      authority: req.headers[":authority"] || "",
      altUsed: req.headers["alt-used"] || "",
      cookie: req.headers.cookie || "",
    });
    resp.writeHead(200, {
      "Content-Type": "text/plain",
      "Content-Length": "3",
    });
    resp.end("ALT");
  });

  registerCleanupFunction(async () => {
    try {
      await originServer.stop();
      await altServer.stop();
    } catch (e) {
      info("Error stopping servers: " + e);
    }
    Services.prefs.clearUserPref("network.http.altsvc.enabled");
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.dns.localDomains");
    Services.prefs.clearUserPref("network.proxy.allow_hijacking_localhost");
    Services.prefs.clearUserPref("network.lna.blocking");
    Services.prefs.clearUserPref("network.localnetwork.prompt.testing");
    Services.prefs.clearUserPref("network.localnetwork.prompt.testing.allow");
    Services.prefs.clearUserPref("network.loopback-network.prompt.testing");
    Services.prefs.clearUserPref(
      "network.loopback-network.prompt.testing.allow"
    );
    Services.prefs.clearUserPref(
      "network.lna.local-network-to-localhost.skip-checks"
    );
    Services.prefs.clearUserPref("network.lna.defer_https_check");
    Services.prefs.clearUserPref("network.lna.address_space.public.override");
    Services.prefs.clearUserPref("network.lna.address_space.private.override");
    override.clearOverrides();
    Services.dns.clearCache(true);
  });
});

// A same-origin request must never reach the Private alternate. Connections are
// dropped before each request so the alternate is actually attempted (else
// Happy Eyeballs coalesces onto the origin connection).
add_task(async function same_origin_altsvc_to_private_blocked() {
  await fetchOrigin();
  for (let i = 0; i < 5; i++) {
    Services.obs.notifyObservers(null, "net:cancel-all-connections");
    Services.dns.clearCache(true);
    await new Promise(res => do_timeout(200, res));
    await fetchOrigin();
  }

  let hits = await altOriginHits();
  info("private endpoint origin requests: " + JSON.stringify(hits));
  Assert.equal(
    hits.length,
    0,
    "Public->Private same-origin request must NOT be delivered to the private " +
      "alt-svc endpoint without an LNA permission grant"
  );
});
