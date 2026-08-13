//
// Regression test for bug 2043946: STOP_SENDING with H3_NO_ERROR (0x100) on a
// server-initiated WebTransport stream must be handled gracefully.
//

/* import-globals-from head_webtransport.js */

"use strict";

var h3Port;
var host;

registerCleanupFunction(async () => {
  Services.prefs.clearUserPref("network.dns.localDomains");
  Services.prefs.clearUserPref(
    "network.http.http3.alt-svc-mapping-for-testing"
  );
});

add_task(async function setup() {
  await http3_setup_tests("h3");

  h3Port = Services.env.get("MOZHTTP3_PORT");
  Assert.notEqual(h3Port, null);
  Assert.notEqual(h3Port, "");
  host = "foo.example.com:" + h3Port;
});

add_task(async function test_wt_stop_sending_no_error() {
  let webTransport = NetUtil.newWebTransport().QueryInterface(
    Ci.nsIWebTransport
  );

  let listener = new WebTransportListener().QueryInterface(
    Ci.WebTransportSessionEventListener
  );

  let pReady = new Promise(resolve => {
    listener.ready = resolve;
  });
  // The server opens a server-initiated bidi stream and, in a later flight,
  // sends STOP_SENDING(H3_NO_ERROR) on it. Resolve once that is delivered.
  let pStopSending = new Promise(resolve => {
    listener.stopSending = resolve;
  });
  // We don't act on the incoming stream, but a handler must exist since
  // onIncomingBidirectionalStreamAvailable calls it.
  listener.streamAvailable = () => {};

  webTransport.asyncConnect(
    NetUtil.newURI(`https://${host}/create_bidi_stream_and_stop_sending`),
    true,
    [],
    Services.scriptSecurityManager.getSystemPrincipal(),
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    listener
  );

  await pReady;

  await pStopSending;

  Assert.ok(true, "STOP_SENDING(H3_NO_ERROR) was handled");

  webTransport.closeSession(0, "");
});
