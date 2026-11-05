/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// A captive portal gateway pins an already-established TCP flow to the walled
// garden for that flow's lifetime, and may also hand out a hijacked DNS answer
// while the client is captive. Either one, left cached, keeps answering the
// probe with the portal's redirect long after the user has logged in, so the
// probe has to open a new connection and re-resolve the name every time.
//
// The portal here answers over IPv4 while it is locked and over IPv6 once it
// is unlocked, so a probe that reused either the pooled connection or the
// cached DNS entry would still be talking to the IPv4 address.
//
// httpd.sys.mjs answers every request with "Connection: close" and so cannot
// exercise the connection half of this. Both servers here are Node ones, which
// do keep the connection alive, so nothing in the test quietly closes a
// connection behind our back.

const { NodeHTTPServer } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

/* globals global */

const kInterfaceName = "wifi";
const kCanonicalHost = "captive.example.com";
const kCanonicalPath = "/captive";

const gOverride = Cc["@mozilla.org/network/native-dns-override;1"].getService(
  Ci.nsINativeDNSResolverOverride
);

// Runs in the Node.js process. Records the peer address of every accepted TCP
// connection, which is what tells a reused connection or a stale DNS answer
// apart from a fresh one.
function recordConnections() {
  global.peerAddresses = [];
  global.server.on("connection", socket => {
    global.peerAddresses.push(socket.remoteAddress);
  });
}

// Runs in the Node.js process. Stands in for the portal's login page.
function loginHandler(req, resp) {
  const body = "login";
  resp.setHeader("Content-Type", "text/plain");
  resp.setHeader("Content-Length", body.length);
  resp.writeHead(200);
  resp.end(body);
}

// Runs in the Node.js process. Redirects to the login page while the portal is
// locked, and serves the canonical content once it has been unlocked.
function captiveHandler(req, resp) {
  if (global.locked) {
    resp.writeHead(302, { Location: global.loginURL });
    resp.end();
    return;
  }
  const body = "true";
  resp.setHeader("Content-Type", "text/plain");
  resp.setHeader("Content-Length", body.length);
  resp.setHeader("Connection", "keep-alive");
  resp.writeHead(200);
  resp.end(body);
}

function isIPv4(address) {
  return address.includes("127.0.0.1");
}

function isIPv6(address) {
  return address.includes("::");
}

add_task(async function test_probe_reconnects_and_reresolves_after_login() {
  // The portal's login page lives on its own server, so that the probes stay
  // the only thing the canonical server ever sees and its connection count
  // keeps meaning what we think it does.
  let loginServer = new NodeHTTPServer();
  await loginServer.start();
  let server = new NodeHTTPServer();
  await server.start();
  registerCleanupFunction(async () => {
    await server.stop();
    await loginServer.stop();
    gOverride.clearOverrides();
  });

  await loginServer.registerPathHandler("/login", loginHandler);
  let loginURL = `${loginServer.origin()}/login`;

  await server.execute(`(${recordConnections})()`);
  await server.execute(`global.locked = true;`);
  await server.execute(`global.loginURL = ${JSON.stringify(loginURL)};`);
  await server.registerPathHandler(kCanonicalPath, captiveHandler);

  // While the portal is locked the canonical name resolves to IPv4 only.
  gOverride.addIPOverride(kCanonicalHost, "127.0.0.1");

  Services.prefs.setCharPref(
    "captivedetect.canonicalURL",
    // eslint-disable-next-line sdl/no-insecure-url
    `http://${kCanonicalHost}:${server.port()}${kCanonicalPath}`
  );
  Services.prefs.setCharPref("captivedetect.canonicalContent", "true");
  Services.prefs.setIntPref("captivedetect.maxWaitingTime", 0);
  Services.prefs.setIntPref("captivedetect.pollingTime", 1);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("captivedetect.canonicalURL");
    Services.prefs.clearUserPref("captivedetect.canonicalContent");
    Services.prefs.clearUserPref("captivedetect.maxWaitingTime");
    Services.prefs.clearUserPref("captivedetect.pollingTime");
  });

  // Phase 1: the portal is locked, so the probe is redirected. Stop the
  // detector as soon as that is reported, so that the login observer cannot
  // race its own retries against the state we are about to change.
  await new Promise(resolve => {
    Services.obs.addObserver(function observe(subject, topic) {
      Services.obs.removeObserver(observe, topic);
      gCaptivePortalDetector.abort(kInterfaceName);
      resolve();
    }, "captive-portal-login");

    gCaptivePortalDetector.checkCaptivePortal(kInterfaceName, {
      QueryInterface: ChromeUtils.generateQI(["nsICaptivePortalCallback"]),
      prepare: function prepare() {
        gCaptivePortalDetector.finishPreparation(kInterfaceName);
      },
      complete: function complete() {
        do_throw("the locked portal should not complete the check");
      },
    });
  });

  // Phase 2: the user logs in. The portal is open and the name now resolves to
  // IPv6 only, so a probe still holding the pooled connection or the cached
  // IPv4 answer would keep reaching the locked side.
  await server.execute(`global.locked = false;`);
  gOverride.clearHostOverride(kCanonicalHost);
  gOverride.addIPOverride(kCanonicalHost, "::1");

  let success = await new Promise(resolve => {
    gCaptivePortalDetector.checkCaptivePortal(kInterfaceName, {
      QueryInterface: ChromeUtils.generateQI(["nsICaptivePortalCallback"]),
      prepare: function prepare() {
        gCaptivePortalDetector.finishPreparation(kInterfaceName);
      },
      complete: function complete(result) {
        resolve(result);
      },
    });
  });

  Assert.ok(success, "the probe succeeds once the portal is unlocked");

  let peers = await server.execute("global.peerAddresses");
  Assert.equal(peers.length, 2, "each probe opened its own connection");
  Assert.ok(
    isIPv4(peers[0]),
    `the locked probe used the IPv4 address (got ${peers[0]})`
  );
  Assert.ok(
    isIPv6(peers[1]),
    `the unlocked probe re-resolved to the IPv6 address (got ${peers[1]})`
  );
});
