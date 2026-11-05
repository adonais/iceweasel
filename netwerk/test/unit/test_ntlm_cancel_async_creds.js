/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// nsHttpNTLMAuth::GenerateCredentialsAsync runs GenerateCredentials on a
// background thread, so a channel cancelled while that is in flight makes
// NTLMGetNextTokenCompleteEvent::Cancel run on the main thread concurrently
// with the background thread filling in the result. Whichever side wins, the
// callback must run exactly once and the channel must end up aborted.
//
// test_bug1683176.js covers the same race for Negotiate; nothing covered it
// for NTLM.

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

let httpserv;
let requestsSeen = 0;

function authHandler(metadata, response) {
  requestsSeen++;
  response.setStatusLine(metadata.httpVersion, 401, "Unauthorized");
  response.setHeader("WWW-Authenticate", "NTLM", false);
  response.write("challenge");
}

// The generic NTLM module reports the identity as invalid, so the channel
// prompts before it generates anything. Answer synchronously to keep the only
// asynchrony in the test the credential generation itself.
function AuthPrompt() {}
AuthPrompt.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIAuthPrompt2"]),
  promptAuth(channel, level, authInfo) {
    authInfo.username = "guest";
    authInfo.password = "guest";
    return true;
  },
  asyncPromptAuth() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
};

function Requestor() {}
Requestor.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIInterfaceRequestor"]),
  getInterface(iid) {
    if (iid.equals(Ci.nsIAuthPrompt2)) {
      if (!this.prompt) {
        this.prompt = new AuthPrompt();
      }
      return this.prompt;
    }
    throw Components.Exception("", Cr.NS_ERROR_NO_INTERFACE);
  },
  prompt: null,
};

// A content principal, so that the auth prompt is not blocked the way it is
// for non-web-content triggered loads.
function makeChan(url) {
  let principal = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(url),
    {}
  );
  let chan = NetUtil.newChannel({
    uri: url,
    loadingPrincipal: principal,
    securityFlags: Ci.nsILoadInfo.SEC_REQUIRE_SAME_ORIGIN_INHERITS_SEC_CONTEXT,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.notificationCallbacks = new Requestor();
  return chan;
}

add_setup(async function setup() {
  Services.prefs.setIntPref("network.auth.subresource-http-auth-allow", 2);
  // Without this the Windows SSPI module handles the challenge using the
  // logged-in user's credentials, which the test has no control over.
  Services.prefs.setBoolPref("network.auth.force-generic-ntlm", true);

  httpserv = new HttpServer();
  httpserv.registerPathHandler("/auth", authHandler);
  httpserv.start(-1);

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.auth.subresource-http-auth-allow");
    Services.prefs.clearUserPref("network.auth.force-generic-ntlm");
    await httpserv.stop();
  });
});

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

add_task(async function test_cancel_during_async_creds() {
  let url = `http://localhost:${httpserv.identity.primaryPort}/auth`;
  let chan = makeChan(url);
  let cancelled = await cancelWhenSuspendedForAuth(chan);

  Assert.ok(cancelled, "the transaction was suspended for authentication");
  Assert.equal(chan.status, Cr.NS_BINDING_ABORTED, "channel was aborted");
  Assert.equal(requestsSeen, 1, "no type 1 message was sent");
});
