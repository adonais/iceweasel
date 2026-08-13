"use strict";

// Bug 2051272: with Happy Eyeballs enabled, Alt-Svc mappings must still be
// validated so the h3 connection is created eagerly and a later request reuses
// it. Unlike test_http3_alt_svc.js, this test never drops connections between
// requests (which would force the h3 route and hide the regression): after the
// h2 response advertises the h3 route, a follow-up must be served over h3.
// The origin is a Node HTTP/2 server; the alternate is the Rust HTTP/3 server.

const { NodeHTTP2Server, HTTP3Server } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

let h2Server;
let h3Server;
let httpsOrigin;
let h3Route;
let h3AltSvc;

add_setup(async function () {
  let h3ServerPath = Services.env.get("MOZ_HTTP3_SERVER_PATH");
  let h3DBPath = Services.env.get("MOZ_HTTP3_CERT_DB_PATH");

  do_get_profile();

  Services.prefs.setBoolPref("network.http.http3.enable", true);
  // The scenario this test guards only reproduces with Happy Eyeballs enabled:
  // that is what makes the alternate share the origin's ConnectionEntry and, in
  // the buggy state, skips validation.
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  Services.prefs.setCharPref("network.dns.localDomains", "foo.example.com");
  Services.prefs.setBoolPref("network.proxy.allow_hijacking_localhost", true);

  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  addCertFromFile(certdb, "http2-ca.pem", "CTu,u,u");

  // The h3 alternate: same host (foo.example.com), different port.
  h3Server = new HTTP3Server();
  await h3Server.start(h3ServerPath, h3DBPath);
  let h3Port = h3Server.port();
  h3Route = "foo.example.com:" + h3Port;
  h3AltSvc = ":" + h3Port;

  // The origin advertises the h3 alternate. The handler runs in the node
  // process (serialized via toString(), so no closures), so the alternate is
  // passed via the x-altsvc request header and echoed into Alt-Svc.
  h2Server = new NodeHTTP2Server();
  await h2Server.start();
  await h2Server.registerPathHandler("/http3-test", (req, resp) => {
    resp.writeHead(200, {
      "Content-Type": "text/plain",
      "Alt-Svc": "h3=" + req.headers["x-altsvc"],
    });
    resp.end("a".repeat(100));
  });

  httpsOrigin = "https://foo.example.com:" + h2Server.port() + "/";

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.http.http3.enable");
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.dns.localDomains");
    Services.prefs.clearUserPref("network.proxy.allow_hijacking_localhost");
    if (h2Server) {
      await h2Server.stop();
    }
    if (h3Server) {
      await h3Server.stop();
    }
  });
});

function makeChan(uri) {
  let chan = NetUtil.newChannel({
    uri,
    loadUsingSystemPrincipal: true,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_DOCUMENT,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.loadFlags = Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;
  return chan;
}

function channelProtocol(request) {
  try {
    return request.protocolVersion;
  } catch (e) {
    return "";
  }
}

function channelRoute(request) {
  try {
    return request.getRequestHeader("Alt-Used");
  } catch (e) {
    return "";
  }
}

// Opens `uri` and resolves with the request's protocol version and Alt-Used
// route.
function requestOnce(uri) {
  return new Promise(resolve => {
    let chan = makeChan(uri);
    chan.setRequestHeader("x-altsvc", h3AltSvc, false);
    chan.asyncOpen({
      QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
      onStartRequest(request) {
        Assert.equal(
          request.QueryInterface(Ci.nsIHttpChannel).responseStatus,
          200
        );
      },
      onDataAvailable(request, stream, off, cnt) {
        read_stream(stream, cnt);
      },
      onStopRequest(request, status) {
        Assert.ok(Components.isSuccessCode(status));
        resolve({
          protocol: channelProtocol(request),
          route: channelRoute(request),
        });
      },
    });
  });
}

const MAX_POLL_RETRIES = 50;

function waitMs(ms) {
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Poll the origin (without ever dropping connections) until it is served over
// h3, i.e. the eagerly-validated h3 connection is being reused.
async function pollUntilH3(uri) {
  for (let i = 0; i < MAX_POLL_RETRIES; i++) {
    let { protocol, route } = await requestOnce(uri);
    info(`follow-up #${i}: protocol=${protocol} route=${route}`);
    if (protocol == "h3") {
      Assert.equal(route, h3Route, "request routed over the alt-svc h3 route");
      return true;
    }
    await waitMs(500);
  }
  return false;
}

add_task(async function test_altsvc_validation_creates_reusable_h3() {
  let uri = httpsOrigin + "http3-test";

  // First request establishes the origin connection over h2 and receives the
  // Alt-Svc: h3 header, which (post-fix) triggers eager validation of the h3
  // route.
  let first = await requestOnce(uri);
  info(`first request: protocol=${first.protocol} route=${first.route}`);
  Assert.equal(first.protocol, "h2", "origin request is served over h2");

  // Without tearing down any connection, a follow-up request must end up on h3
  // because validation created a reusable h3 connection.
  let usedH3 = await pollUntilH3(uri);
  Assert.ok(
    usedH3,
    "a follow-up request reused the eagerly-validated h3 connection"
  );
});
