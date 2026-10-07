/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// When a pooled HTTP/2 connection is silently dropped by the server (the
// underlying socket is destroyed with no GOAWAY and no RST_STREAM) before
// any response bytes are sent for a request, the request should be
// transparently retried on a new connection rather than failing outright.
//
// Regression test for Bug 2065319.

"use strict";

const { NodeHTTPServer, with_node_servers } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

// Executed in the Node.js process: a real HTTP/2 server that answers the
// first request on a connection normally, then silently destroys the
// underlying socket (no GOAWAY, no RST_STREAM) for any subsequent request on
// that same connection, before sending any response bytes.
function setupServer() {
  const http2 = require("http2");
  const fs = require("fs");
  const path = require("path");

  global.sessionCount = 0;

  const options = {
    key: fs.readFileSync(path.join(__dirname, "http2-cert.key")),
    cert: fs.readFileSync(path.join(__dirname, "http2-cert.pem")),
  };

  const server = http2.createSecureServer(options);
  server.on("session", session => {
    global.sessionCount++;
    session.streamCount = 0;
  });
  server.on("stream", stream => {
    stream.session.streamCount++;
    if (stream.session.streamCount === 1) {
      stream.respond({
        ":status": 200,
        "content-type": "text/plain",
        "content-length": "2",
      });
      stream.end("ok");
      return;
    }
    // Second (and later) request on this connection: drop it silently
    // (no GOAWAY, no RST_STREAM).
    stream.session.destroy();
  });

  return ADB.listenAndForwardPort(server, 0); // eslint-disable-line no-undef
}

function getSessionCount() {
  return global.sessionCount;
}

add_task(async function test_h2_unclean_shutdown_retry() {
  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  addCertFromFile(certdb, "http2-ca.pem", "CTu,u,u");

  await with_node_servers([NodeHTTPServer], async server => {
    let port = await server.execute(`(${setupServer})()`);

    let [req1, buf1] = await channelOpenPromise(
      makeChan(`https://localhost:${port}/first`),
      0
    );
    equal(req1.status, Cr.NS_OK);
    equal(req1.QueryInterface(Ci.nsIHttpChannel).responseStatus, 200);
    equal(buf1, "ok");

    // Reuses the pooled connection from the first request. The server will
    // silently drop this connection instead of responding, so this only
    // succeeds if the transaction is retried on a fresh connection.
    let [req2, buf2] = await channelOpenPromise(
      makeChan(`https://localhost:${port}/second`),
      0
    );
    equal(req2.status, Cr.NS_OK);
    equal(req2.QueryInterface(Ci.nsIHttpChannel).responseStatus, 200);
    equal(buf2, "ok");

    let sessionCount = await server.execute(`(${getSessionCount})()`);
    equal(sessionCount, 2, "expected the second request on a new connection");
  });
});
