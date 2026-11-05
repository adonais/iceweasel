/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Tests which requests get Windows SSO credentials attached, using fake
// credentials from network.http.windows-sso.credentials-for-testing in place of
// the Windows API.

const { NodeHTTPServer, NodeHTTPSServer } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

const DEVICE = "x-ms-devicecredential";
const USER = "x-ms-refreshtokencredential";

let httpsServer;
let liveServer;
let httpServer;

async function startEchoServer(server, ...startArgs) {
  await server.start(...startArgs);
  registerCleanupFunction(() => server.stop());
  await server.registerPathHandler("/", (req, resp) => {
    resp.writeHead(200, { "Content-Type": "application/json" });
    resp.end(JSON.stringify(req.headers));
  });
}

async function getRequestHeaders(
  url,
  {
    type = Ci.nsIContentPolicy.TYPE_DOCUMENT,
    isPrivate = false,
    userContextId = 0,
    anonymous = false,
  } = {}
) {
  let chan = NetUtil.newChannel({
    uri: url,
    loadUsingSystemPrincipal: true,
    contentPolicyType: type,
  });
  if (userContextId) {
    chan.loadInfo.originAttributes = { userContextId };
  }
  if (isPrivate) {
    chan.QueryInterface(Ci.nsIPrivateBrowsingChannel).setPrivate(true);
  }
  if (anonymous) {
    chan.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
  }
  let buffer = await new Promise(resolve => {
    chan.asyncOpen(
      new ChannelListener(
        (req, buff) => resolve(buff),
        null,
        CL_ALLOW_UNKNOWN_CL
      )
    );
  });
  return JSON.parse(buffer);
}

function assertNoCredentials(headers, message) {
  ok(!(DEVICE in headers), `${message}: no device credential`);
  ok(!(USER in headers), `${message}: no user credential`);
}

add_setup(async function () {
  Services.prefs.setCharPref(
    "network.http.windows-sso.credentials-for-testing",
    "x-ms-DeviceCredential=device|x-ms-RefreshTokenCredential=user; path=/|DIDC=cookie"
  );
  Services.prefs.setCharPref("network.dns.localDomains", "login.live.com");

  httpsServer = new NodeHTTPSServer();
  await startEchoServer(httpsServer);
  liveServer = new NodeHTTPSServer();
  await startEchoServer(liveServer, 0, ["login.live.com"]);
  httpServer = new NodeHTTPServer();
  await startEchoServer(httpServer);

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(
      "network.http.windows-sso.credentials-for-testing"
    );
    Services.prefs.clearUserPref("network.dns.localDomains");
    Services.prefs.clearUserPref("network.http.windows-sso.enabled");
    Services.prefs.clearUserPref(
      "network.http.windows-sso.container-enabled.2"
    );
  });
});

add_task(async function test_disabled() {
  Services.prefs.setBoolPref("network.http.windows-sso.enabled", false);
  let headers = await getRequestHeaders(`${httpsServer.origin()}/`);
  assertNoCredentials(headers, "Windows SSO disabled");
});

add_task(async function test_document_and_subdocument() {
  Services.prefs.setBoolPref("network.http.windows-sso.enabled", true);

  let headers = await getRequestHeaders(`${httpsServer.origin()}/`);
  equal(headers[DEVICE], "device", "Document gets the device credential");
  equal(headers[USER], "user", "Document gets the user credential");
  ok(!headers.cookie?.includes("DIDC"), "No cookies outside .live.com");

  headers = await getRequestHeaders(`${httpsServer.origin()}/`, {
    type: Ci.nsIContentPolicy.TYPE_SUBDOCUMENT,
  });
  equal(headers[DEVICE], "device", "Subdocument gets the device credential");
  equal(headers[USER], "user", "Subdocument gets the user credential");
});

add_task(async function test_other_load_types() {
  Services.prefs.setBoolPref("network.http.windows-sso.enabled", true);
  for (let type of [
    Ci.nsIContentPolicy.TYPE_OTHER,
    Ci.nsIContentPolicy.TYPE_IMAGE,
  ]) {
    let headers = await getRequestHeaders(`${httpsServer.origin()}/`, {
      type,
    });
    assertNoCredentials(headers, `Content policy type ${type}`);
  }
});

add_task(async function test_insecure() {
  Services.prefs.setBoolPref("network.http.windows-sso.enabled", true);
  let headers = await getRequestHeaders(`${httpServer.origin()}/`);
  assertNoCredentials(headers, "Plain http");
});

add_task(async function test_private_and_anonymous() {
  Services.prefs.setBoolPref("network.http.windows-sso.enabled", true);
  let headers = await getRequestHeaders(`${httpsServer.origin()}/`, {
    isPrivate: true,
  });
  assertNoCredentials(headers, "Private browsing");

  headers = await getRequestHeaders(`${httpsServer.origin()}/`, {
    anonymous: true,
  });
  assertNoCredentials(headers, "Anonymous load");
});

add_task(async function test_containers() {
  Services.prefs.setBoolPref("network.http.windows-sso.enabled", true);
  let headers = await getRequestHeaders(`${httpsServer.origin()}/`, {
    userContextId: 2,
  });
  assertNoCredentials(headers, "Container without SSO enabled");

  Services.prefs.setBoolPref(
    "network.http.windows-sso.container-enabled.2",
    true
  );
  headers = await getRequestHeaders(`${httpsServer.origin()}/`, {
    userContextId: 2,
  });
  equal(headers[DEVICE], "device", "Container with SSO enabled");
  equal(headers[USER], "user", "Container with SSO enabled");
});

add_task(async function test_live_cookies() {
  Services.prefs.setBoolPref("network.http.windows-sso.enabled", true);
  let headers = await getRequestHeaders(`${liveServer.origin()}/`);
  ok(headers.cookie?.includes("DIDC=cookie"), ".live.com gets cookies");
  equal(headers[DEVICE], "device", ".live.com gets the device credential");
});
