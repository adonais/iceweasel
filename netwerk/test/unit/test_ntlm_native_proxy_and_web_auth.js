/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// A proxy-then-web NTLM sequence like test_ntlm_proxy_and_web_auth.js, but
// without network.auth.force-generic-ntlm, so it runs against the native module
// (nsAuthSSPI) rather than the internal one.
//
// This covers what nothing else does: nsHttpNTLMAuth::mUseNative, and an
// nsAuthSSPI instance created on the main thread in ChallengeReceived whose
// Init and GetNextToken then run on a background thread -- the reason that
// class needs threadsafe refcounting.
//
// Scope note: the sequence stops after the type 1 message. Answering a type 2
// challenge makes SSPI derive a response from whoever is logged in, and on a
// machine with no credentials for the domain named in the challenge it fails
// with SEC_E_NO_CREDENTIALS. That is exactly why the other proxy tests set
// force-generic-ntlm. Everything up to and including the type 1 message is
// machine independent, so that is what is asserted here; the type 3 step stays
// covered by the generic tests.

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

ChromeUtils.defineLazyGetter(this, "URL", function () {
  return "http://localhost:" + httpserver.identity.primaryPort;
});

// The host is trusted for automatic NTLM, so the native module uses default
// credentials and reports the identity as valid. Nothing may ask for a prompt;
// the internal module would, which is what distinguishes the two here.
function Requestor() {}
Requestor.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIInterfaceRequestor"]),
  getInterface(iid) {
    if (iid.equals(Ci.nsIAuthPrompt2)) {
      Assert.ok(false, "should not be prompted when using default credentials");
    }
    throw Components.Exception("", Cr.NS_ERROR_NO_INTERFACE);
  },
};

function makeChan(url, loadingUrl) {
  let principal = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(loadingUrl),
    {}
  );
  return NetUtil.newChannel({
    uri: url,
    loadingPrincipal: principal,
    securityFlags: Ci.nsILoadInfo.SEC_REQUIRE_SAME_ORIGIN_INHERITS_SEC_CONTEXT,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
  });
}

const NTLM_TYPE1_PREFIX = "NTLM TlRMTVNTUAABAAAA";
const NTLM_PREFIX_LEN = 21;

let httpserver = null;
let requestsMade = 0;

function assertTypeOneMessage(metadata, header, description) {
  Assert.ok(metadata.hasHeader(header), `${description}: ${header} present`);
  let authorization = metadata.getHeader(header);
  Assert.equal(
    authorization.substring(0, NTLM_PREFIX_LEN),
    NTLM_TYPE1_PREFIX,
    `${description}: is a type 1 message`
  );
  // A type 1 message carries the negotiate flags and the workstation/domain of
  // whoever is logged in, so it is always longer than the bare prefix.
  Assert.greater(
    authorization.length,
    NTLM_PREFIX_LEN,
    `${description}: token is not empty`
  );
}

// The proxy challenges, accepts the type 1 message, and hands over to the web
// server, which does the same.
function authHandler(metadata, response) {
  switch (requestsMade) {
    case 0:
      response.setStatusLine(metadata.httpVersion, 407, "Unauthorized");
      response.setHeader("Proxy-Authenticate", "NTLM", false);
      break;
    case 1:
      assertTypeOneMessage(metadata, "Proxy-Authorization", "proxy");
      response.setStatusLine(metadata.httpVersion, 401, "Unauthorized");
      response.setHeader("WWW-Authenticate", "NTLM", false);
      break;
    case 2:
      assertTypeOneMessage(metadata, "Authorization", "web server");
      response.setStatusLine(metadata.httpVersion, 200, "Successful");
      break;
    default:
      response.setStatusLine(metadata.httpVersion, 200, "Successful");
  }
  requestsMade++;
}

add_setup(async function setup() {
  httpserver = new HttpServer();
  httpserver.start(-1);

  // Trust localhost for automatic NTLM so the native module uses the logged-in
  // user's credentials instead of prompting.
  Services.prefs.setCharPref(
    "network.automatic-ntlm-auth.trusted-uris",
    "localhost"
  );
  Services.prefs.setBoolPref("network.automatic-ntlm-auth.allow-proxies", true);

  Services.prefs.setCharPref("network.proxy.http", "localhost");
  Services.prefs.setIntPref(
    "network.proxy.http_port",
    httpserver.identity.primaryPort
  );
  Services.prefs.setCharPref("network.proxy.no_proxies_on", "");
  Services.prefs.setIntPref("network.proxy.type", 1);
  Services.prefs.setBoolPref("network.proxy.allow_hijacking_localhost", true);

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.automatic-ntlm-auth.trusted-uris");
    Services.prefs.clearUserPref("network.automatic-ntlm-auth.allow-proxies");
    Services.prefs.clearUserPref("network.proxy.http");
    Services.prefs.clearUserPref("network.proxy.http_port");
    Services.prefs.clearUserPref("network.proxy.no_proxies_on");
    Services.prefs.clearUserPref("network.proxy.type");
    Services.prefs.clearUserPref("network.proxy.allow_hijacking_localhost");
    await httpserver.stop();
  });
});

add_task(async function test_native_ntlm_proxy_and_web_auth() {
  requestsMade = 0;
  Cc["@mozilla.org/network/http-auth-manager;1"]
    .getService(Ci.nsIHttpAuthManager)
    .clearAll();

  httpserver.registerPathHandler("/auth", authHandler);

  let chan = makeChan(URL + "/auth", URL);
  chan.notificationCallbacks = new Requestor();

  let request = await new Promise(resolve => {
    chan.asyncOpen(new ChannelListener(req => resolve(req)));
  });

  Assert.equal(
    request.QueryInterface(Ci.nsIHttpChannel).responseStatus,
    200,
    "both the proxy and the server accepted the native credentials"
  );
  Assert.equal(requestsMade, 3, "expected number of requests");
});
