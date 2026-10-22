/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Once an HTTP/3 connection is established, the server closes it with an
// application error (H3_FRAME_ERROR, "http3.invalid_header_field") when a
// request carries a raw non-ASCII cookie. The affected requests fail with
// NS_ERROR_NET_HTTP3_PROTOCOL_ERROR on HTTP/3 and must be retried over HTTP/2.

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

const HOST = "foo.example.com";
// The UTF-8 bytes of the cookie are sent as-is, like document.cookie does.
const BAD_COOKIE = unescape(
  encodeURIComponent('c={"tabAudience":"pro-및-business+-플랜"}')
);
const POST_BODY = "a".repeat(2281);

let h3Server;
let h2Server;
let h3ServerPath;
let h3DBPath;

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

  h2Server = new NodeHTTP2Server();
  await h2Server.start();
  await h2Server.registerPathHandler("/", (_req, resp) => {
    resp.writeHead(200, { "Content-Type": "text/plain" });
    resp.end("ok");
  });
  await h2Server.registerPathHandler("/post", (req, resp) => {
    let length = 0;
    req.on("data", chunk => {
      length += chunk.length;
    });
    req.on("end", () => {
      resp.writeHead(200, { "Content-Type": "text/plain" });
      resp.end(`posted ${length}`);
    });
  });

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.http.http3.enable");
    Services.prefs.clearUserPref("network.socket.attach_mock_network_layer");
    Services.prefs.clearUserPref("network.http.speculative-parallel-limit");
    Services.prefs.clearUserPref(
      "network.http.http3.fallback_to_h2_on_protocol_error"
    );
    Services.prefs.clearUserPref(
      "network.http.http3.alt-svc-mapping-for-testing"
    );
    override.clearOverrides();
    mockController.clearBlockedTCPConnect();
    await h2Server.stop();
    if (h3Server) {
      await h3Server.stop();
    }
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
  // Aborting a pending HTTP/3 connection above excludes the origin.
  Services.obs.notifyObservers(null, "network:reset-http3-excluded-list");
}

function makeChan(path, { cookie = BAD_COOKIE, post = false } = {}) {
  let chan = NetUtil.newChannel({
    uri: `https://${HOST}:${h2Server.port()}${path}`,
    loadUsingSystemPrincipal: true,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.loadFlags = Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;
  if (cookie) {
    chan.setRequestHeader("Cookie", cookie, false);
  }
  if (post) {
    let stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
      Ci.nsIStringInputStream
    );
    stream.setByteStringData(POST_BODY);
    chan
      .QueryInterface(Ci.nsIUploadChannel)
      .setUploadStream(stream, "application/x-www-form-urlencoded", -1);
    chan.requestMethod = "POST";
  }
  return chan;
}

// Resolves with the outcome of the load instead of throwing on failure.
function openChan(chan) {
  return new Promise(resolve => {
    let buffer = "";
    chan.asyncOpen({
      QueryInterface: ChromeUtils.generateQI([
        "nsIStreamListener",
        "nsIRequestObserver",
      ]),
      onStartRequest() {},
      onDataAvailable(request, stream, offset, count) {
        buffer += NetUtil.readInputStreamToString(stream, count);
      },
      onStopRequest(request, status) {
        let httpVersion = "";
        let responseStatus = 0;
        try {
          request.QueryInterface(Ci.nsIHttpChannel);
          httpVersion = request.protocolVersion;
          responseStatus = request.responseStatus;
        } catch (e) {}
        resolve({ status, httpVersion, responseStatus, buffer });
      },
    });
  });
}

function checkFallback(result, expectedBody, label) {
  Assert.equal(
    result.status,
    Cr.NS_OK,
    `${label}: load succeeds instead of failing with the HTTP/3 error`
  );
  Assert.equal(result.responseStatus, 200, `${label}: response status`);
  Assert.equal(result.httpVersion, "h2", `${label}: retried over HTTP/2`);
  Assert.equal(result.buffer, expectedBody, `${label}: response body`);
}

// Establishes an HTTP/3 connection to HOST with a request that the server
// accepts.
async function setupH3Connection() {
  h3Server = new HTTP3Server();
  await h3Server.start(h3ServerPath, h3DBPath);
  await resetConnections();

  override.addIPOverride(HOST, "127.0.0.1");
  Services.prefs.setCharPref(
    "network.http.http3.alt-svc-mapping-for-testing",
    `${HOST};h3=:${h3Server.port()}`
  );

  let result;
  if (Services.prefs.getBoolPref("network.http.happy_eyeballs_enabled")) {
    // Block TCP so that HTTP/2 can't win the race.
    let blockedTCP = mockController.createScriptableNetAddr(
      "127.0.0.1",
      h2Server.port()
    );
    mockController.blockTCPConnect(blockedTCP);
    result = await openChan(makeChan("/", { cookie: null }));
    mockController.clearBlockedTCPConnect();
  } else {
    // The alt-svc mapping is only used once it is validated, so earlier
    // requests go over HTTP/2.
    do {
      result = await openChan(makeChan("/", { cookie: null }));
    } while (result.httpVersion != "h3");
  }
  Assert.equal(result.status, Cr.NS_OK, "warm-up load succeeds");
  Assert.equal(result.httpVersion, "h3", "warm-up load uses HTTP/3");
  Assert.equal(result.buffer, "Hello World", "warm-up body");
}

async function teardown() {
  mockController.clearBlockedTCPConnect();
  await h3Server.stop();
  h3Server = null;
}

// Several requests are in flight on the HTTP/3 connection when the server
// closes it.
async function do_test_parallel_requests() {
  await setupH3Connection();

  let loads = [
    openChan(makeChan("/")),
    openChan(makeChan("/post", { post: true })),
    openChan(makeChan("/")),
    openChan(makeChan("/")),
    openChan(makeChan("/post", { post: true })),
  ];
  let results = await Promise.all(loads);

  checkFallback(results[0], "ok", "parallel GET 0");
  checkFallback(results[1], `posted ${POST_BODY.length}`, "parallel POST 1");
  checkFallback(results[2], "ok", "parallel GET 2");
  checkFallback(results[3], "ok", "parallel GET 3");
  checkFallback(results[4], `posted ${POST_BODY.length}`, "parallel POST 4");

  await teardown();
}

// Requests are issued one after another. Each one may open a new HTTP/3
// connection that the server closes again.
async function do_test_sequential_requests() {
  await setupH3Connection();

  checkFallback(
    await openChan(makeChan("/post", { post: true })),
    `posted ${POST_BODY.length}`,
    "sequential POST 0"
  );
  checkFallback(await openChan(makeChan("/")), "ok", "sequential GET 1");
  checkFallback(await openChan(makeChan("/")), "ok", "sequential GET 2");
  checkFallback(
    await openChan(makeChan("/post", { post: true })),
    `posted ${POST_BODY.length}`,
    "sequential POST 3"
  );

  await teardown();
}

add_task(async function test_parallel_no_speculative() {
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 0);
  await do_test_parallel_requests();
});

add_task(async function test_parallel_with_speculative() {
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 6);
  await do_test_parallel_requests();
});

add_task(async function test_sequential_no_speculative() {
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 0);
  await do_test_sequential_requests();
});

add_task(async function test_sequential_with_speculative() {
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 6);
  await do_test_sequential_requests();
});

// Without Happy Eyeballs, the origin is also put on the HTTP/3 excluded list.
async function withHappyEyeballsDisabled(aSpeculativeLimit, aTest) {
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", false);
  Services.prefs.setIntPref(
    "network.http.speculative-parallel-limit",
    aSpeculativeLimit
  );
  try {
    await aTest();
  } finally {
    Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  }
}

add_task(async function test_parallel_no_speculative_no_happy_eyeballs() {
  await withHappyEyeballsDisabled(0, do_test_parallel_requests);
});

add_task(async function test_parallel_with_speculative_no_happy_eyeballs() {
  await withHappyEyeballsDisabled(6, do_test_parallel_requests);
});

add_task(async function test_sequential_no_speculative_no_happy_eyeballs() {
  await withHappyEyeballsDisabled(0, do_test_sequential_requests);
});

add_task(async function test_sequential_with_speculative_no_happy_eyeballs() {
  await withHappyEyeballsDisabled(6, do_test_sequential_requests);
});

add_task(async function test_fallback_disabled_by_pref() {
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 0);
  Services.prefs.setBoolPref(
    "network.http.http3.fallback_to_h2_on_protocol_error",
    false
  );
  await setupH3Connection();

  let result = await openChan(makeChan("/"));
  Assert.equal(
    result.status,
    Cr.NS_ERROR_NET_HTTP3_PROTOCOL_ERROR,
    "the load fails with the HTTP/3 error when the fallback is disabled"
  );

  Services.prefs.clearUserPref(
    "network.http.http3.fallback_to_h2_on_protocol_error"
  );
  await teardown();
});
