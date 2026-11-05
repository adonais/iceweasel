/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Negotiate auth defers nsIAuthModule initialization off the main thread via
// nsIAuthModule::initAsync. nsAuthSSPI implements that by resolving the
// canonical name of the host, so that the SPN is built from the CNAME target
// rather than from the name in the URI.
//
// The other tests that exercise Negotiate use "localhost", which nsHostResolver
// satisfies without ever reaching a resolver thread -- the lookup completes
// re-entrantly inside AsyncResolveNative and the asynchronous path is never
// taken. Resolving through a TRR server forces a real async resolution and
// lets us point the host at a CNAME.

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const HOST = "negotiate.example.com";
const CANONICAL_HOST = "canonical.example.com";

let trrServer;
let httpserv;

// Requests seen by the server, in order, each entry being the value of the
// Authorization header or null when the request carried none.
let requests = [];

function authHandler(metadata, response) {
  let authorization = metadata.hasHeader("Authorization")
    ? metadata.getHeader("Authorization")
    : null;
  requests.push(authorization);

  if (!authorization) {
    response.setStatusLine(metadata.httpVersion, 401, "Unauthorized");
    response.setHeader("WWW-Authenticate", "Negotiate", false);
    response.write("challenge");
    return;
  }

  response.setStatusLine(metadata.httpVersion, 200, "OK");
  response.write("authenticated");
}

function makeChan(url) {
  return NetUtil.newChannel({
    uri: url,
    loadUsingSystemPrincipal: true,
  }).QueryInterface(Ci.nsIHttpChannel);
}

function channelOpenPromise(chan, flags) {
  return new Promise(resolve => {
    chan.asyncOpen(
      new ChannelListener((req, buffer) => resolve([req, buffer]), null, flags)
    );
  });
}

add_setup(async function setup() {
  trr_test_setup();

  trrServer = new TRRServer();
  await trrServer.start();
  Services.dns.clearCache(true);
  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );

  // negotiate.example.com is a CNAME for canonical.example.com, which is what
  // the SPN must end up being built from.
  await trrServer.registerDoHAnswers(HOST, "A", {
    answers: [
      {
        name: HOST,
        ttl: 55,
        type: "CNAME",
        flush: false,
        data: CANONICAL_HOST,
      },
      {
        name: CANONICAL_HOST,
        ttl: 55,
        type: "A",
        flush: false,
        data: "127.0.0.1",
      },
    ],
  });

  Services.prefs.setIntPref("network.auth.subresource-http-auth-allow", 2);
  Services.prefs.setStringPref("network.negotiate-auth.trusted-uris", HOST);

  httpserv = new HttpServer();
  httpserv.registerPathHandler("/auth", authHandler);
  httpserv.start(-1);
  httpserv.identity.add("http", HOST, httpserv.identity.primaryPort);

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.auth.subresource-http-auth-allow");
    Services.prefs.clearUserPref("network.negotiate-auth.trusted-uris");
    trr_clear_prefs();
    await trrServer.stop();
    await httpserv.stop();
  });
});

// The canonical name lookup that nsAuthSSPI::InitAsync performs has to
// actually happen, and the credentials it produces have to make it back to the
// channel on the main thread.
add_task(async function test_negotiate_auth_over_cname() {
  let url = `http://${HOST}:${httpserv.identity.primaryPort}/auth`;
  let [request, buffer] = await channelOpenPromise(makeChan(url));

  Assert.equal(request.status, Cr.NS_OK, "channel succeeded");
  Assert.equal(
    request.QueryInterface(Ci.nsIHttpChannel).responseStatus,
    200,
    "authenticated after the 401"
  );
  Assert.equal(buffer, "authenticated", "got the authenticated body");

  Assert.equal(requests.length, 2, "server saw a challenge and a retry");
  Assert.equal(requests[0], null, "first request was unauthenticated");
  Assert.ok(
    requests[1] && requests[1].startsWith("Negotiate "),
    `retry carried Negotiate credentials, got ${requests[1]}`
  );
});
