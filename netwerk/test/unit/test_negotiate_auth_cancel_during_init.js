/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Cancelling a channel while nsAuthSSPI::InitAsync still has a canonical name
// lookup in flight. The cancellation runs on the main thread and races the
// background thread that finishes the init and then generates the credentials,
// so this covers GetNextTokenCompleteEvent's state being touched from both.
//
// The lookup is made slow with a delayed DoH response, which puts the cancel
// squarely in the middle of the init rather than leaving it up to chance.

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const HOST = "negotiate-cancel.example.com";
const RESOLUTION_DELAY_MS = 500;

let trrServer;
let httpserv;
let requestsSeen = 0;

function authHandler(metadata, response) {
  requestsSeen++;
  response.setStatusLine(metadata.httpVersion, 401, "Unauthorized");
  response.setHeader("WWW-Authenticate", "Negotiate", false);
  response.write("challenge");
}

function makeChan(url) {
  return NetUtil.newChannel({
    uri: url,
    loadUsingSystemPrincipal: true,
  }).QueryInterface(Ci.nsIHttpChannel);
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

  await trrServer.registerDoHAnswers(HOST, "A", {
    delay: RESOLUTION_DELAY_MS,
    answers: [
      {
        name: HOST,
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

// Cancels the channel as soon as the transaction is suspended waiting for
// credentials, which is the point where the background init has been kicked
// off but cannot have finished yet.
function cancelWhenSuspendedForAuth(chan) {
  return new Promise(resolve => {
    let topic = "http-on-transaction-suspended-authentication";
    let cancelled = false;
    let observer = {
      QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
      observe(aSubject, aTopic) {
        if (aTopic != topic) {
          return;
        }
        Services.obs.removeObserver(observer, topic);
        cancelled = true;
        aSubject.QueryInterface(Ci.nsIChannel).cancel(Cr.NS_BINDING_ABORTED);
      },
    };
    Services.obs.addObserver(observer, topic);

    chan.asyncOpen(
      new ChannelListener(
        () => {
          if (!cancelled) {
            Services.obs.removeObserver(observer, topic);
          }
          resolve(cancelled);
        },
        null,
        CL_EXPECT_FAILURE
      )
    );
  });
}

add_task(async function test_cancel_during_async_init() {
  let url = `http://${HOST}:${httpserv.identity.primaryPort}/auth`;
  let chan = makeChan(url);
  let cancelled = await cancelWhenSuspendedForAuth(chan);

  Assert.ok(cancelled, "the transaction was suspended for authentication");
  Assert.equal(chan.status, Cr.NS_BINDING_ABORTED, "channel was aborted");

  // The credentials never reached the channel, so the server only ever saw the
  // request that produced the challenge.
  Assert.equal(requestsSeen, 1, "no authenticated retry was sent");
});
