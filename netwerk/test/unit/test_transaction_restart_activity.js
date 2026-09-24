/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Two things a consumer of nsITimedChannel and the activity distributor relies
// on, for bug 2067308:
//
//  * nsHttpTransaction::Restart clears mTimings, so what the channel reports
//    describes the attempt that served the request. Nothing else clears it for
//    a retry re-dispatched onto an established connection, since
//    nsHttpConnection::Activate only bootstraps a connection's first
//    transaction.
//  * a response is reported complete even when its length is signalled only by
//    the stream end, which is how HTTP/2 delivers a response with no
//    content-length.

"use strict";

const { NodeHTTPSServer, NodeHTTP2Server } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

let server;
let h2Server;

add_setup(async function () {
  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  addCertFromFile(certdb, "http2-ca.pem", "CTu,u,u");
  Services.prefs.setCharPref("network.dns.localDomains", "foo.example.com");

  server = new NodeHTTPSServer();
  await server.start();

  // Holds its connection open until /drop-pooled releases it.
  await server.registerPathHandler("/hold", (req, resp) => {
    global.heldResponse = resp;
  });

  // Occupies a second connection while /hold has the first. Releases /hold so
  // that connection goes idle, then drops this one unanswered, so the retry has
  // an established connection to be re-dispatched onto.
  await server.registerPathHandler("/drop-pooled", (req, resp) => {
    if (global.droppedPooled) {
      resp.writeHead(200, { "Content-Type": "text/plain" });
      resp.end("ok");
      return;
    }
    global.droppedPooled = true;
    // These run in the node server, not in Gecko.
    /* eslint-disable mozilla/no-arbitrary-setTimeout */
    setTimeout(() => {
      if (global.heldResponse) {
        global.heldResponse.writeHead(200, { "Content-Type": "text/plain" });
        global.heldResponse.end("held");
        global.heldResponse = null;
      }
      setTimeout(() => resp.socket.destroy(), 200);
    }, 300);
    /* eslint-enable mozilla/no-arbitrary-setTimeout */
  });

  h2Server = new NodeHTTP2Server();
  await h2Server.start();
  await h2Server.registerPathHandler("/unsized", (req, resp) => {
    resp.writeHead(200, { "Content-Type": "text/plain" });
    resp.end("ok");
  });
  await h2Server.registerPathHandler("/sized", (req, resp) => {
    resp.writeHead(200, {
      "Content-Type": "text/plain",
      "Content-Length": "2",
    });
    resp.end("ok");
  });

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.dns.localDomains");
    await server?.stop();
    await h2Server?.stop();
  });
});

// The channel is needed alongside its response, to read nsITimedChannel off it.
function openChannel(uri) {
  const chan = makeChan(uri);
  return { chan, done: channelOpenPromise(chan, CL_ALLOW_UNKNOWN_CL) };
}

// Collects the HTTP transaction activity reported for one channel, waiting for
// `until` rather than guessing how long the marshalling to the main thread takes.
async function transactionActivity(uri, until) {
  let sequence = [];
  let distributor = Cc[
    "@mozilla.org/network/http-activity-distributor;1"
  ].getService(Ci.nsIHttpActivityDistributor);
  let observer = {
    observeActivity(aChannel, aActivityType, aActivitySubtype) {
      if (
        aActivityType !==
        Ci.nsIHttpActivityObserver.ACTIVITY_TYPE_HTTP_TRANSACTION
      ) {
        return;
      }
      try {
        if (aChannel.QueryInterface(Ci.nsIChannel).URI.spec === uri) {
          sequence.push(aActivitySubtype);
        }
      } catch (e) {}
    },
  };
  distributor.addObserver(observer);

  try {
    const { done } = openChannel(uri);
    await done;
    // The notifications are marshalled to the main thread, so some are still in
    // flight when onStopRequest runs.
    await TestUtils.waitForCondition(
      () => sequence.includes(until),
      `activity subtype ${until} was reported`
    );
  } finally {
    // Left registered, it would keep filling a dead array and turn one failure
    // into a cascade over the remaining tasks.
    distributor.removeObserver(observer);
  }

  return sequence;
}

add_task(async function test_restart_onto_pooled_connection_clears_timings() {
  const held = openChannel(
    `https://foo.example.com:${server.port()}/hold`
  ).done;

  // /drop-pooled only has a connection to hand over once /hold owns one, so wait
  // for the server to say so rather than racing its timer.
  await TestUtils.waitForCondition(
    async () => (await server.execute("!!global.heldResponse")) === true,
    "/hold is occupying a connection"
  );

  // The failed attempt connects as soon as this is opened; /drop-pooled releases
  // /hold and drops it 500ms later, so anything the serving attempt stamps has
  // to postdate that. Microseconds, to compare against PRTime.
  const openedAt = Date.now() * 1000;
  const AFTER_DROP_US = 400_000;

  const { chan, done } = openChannel(
    `https://foo.example.com:${server.port()}/drop-pooled`
  );
  const timedChannel = chan.QueryInterface(Ci.nsITimedChannel);
  const [, buffer] = await done;
  await held;

  info(
    `connectStart=${timedChannel.connectStartTime} ` +
      `domainLookupStart=${timedChannel.domainLookupStartTime} ` +
      `requestStart=${timedChannel.requestStartTime}`
  );

  Assert.equal(buffer, "ok", "the retried request succeeded");

  // Proves a restart happened at all, so the checks below cannot pass simply
  // because nothing was ever stamped: only a retry can send after the drop.
  Assert.greaterOrEqual(
    timedChannel.requestStartTime,
    openedAt + AFTER_DROP_US,
    `requestStart (${timedChannel.requestStartTime}) is the retry's, not the ` +
      `failed attempt's`
  );

  // Zero when the retry was re-dispatched onto the connection /hold released,
  // and so resolved and connected nothing. A stamp of its own is fine too - the
  // connection manager is free to open a fresh one - as long as it is not the
  // failed attempt's, which is the regression this guards.
  for (const field of ["connectStartTime", "domainLookupStartTime"]) {
    const value = timedChannel[field];
    Assert.ok(
      value === 0 || value >= openedAt + AFTER_DROP_US,
      `${field} (${value}) is not left over from the failed attempt, ` +
        `which connected around ${openedAt} and was dropped 500ms later`
    );
  }
});

add_task(async function test_response_complete_without_content_length() {
  // HTTP/2 marks a response complete from the stream end. Without a
  // content-length, HandleContent never reaches its end-of-file branch and Close
  // finds the response already complete, so nothing reported it and consumers
  // had no receive phase for these responses.
  const COMPLETE =
    Ci.nsIHttpActivityObserver.ACTIVITY_SUBTYPE_RESPONSE_COMPLETE;

  for (const [path, label] of [
    ["/unsized", "no content-length"],
    ["/sized", "with content-length"],
  ]) {
    // Waits for the terminal notification, so a duplicate RESPONSE_COMPLETE
    // would have arrived by the time the count below is taken.
    const sequence = await transactionActivity(
      `https://foo.example.com:${h2Server.port()}${path}`,
      Ci.nsIHttpActivityObserver.ACTIVITY_SUBTYPE_TRANSACTION_CLOSE
    );
    info(`${label}: ${sequence.join(",")}`);
    Assert.equal(
      sequence.filter(subtype => subtype === COMPLETE).length,
      1,
      `${label}: the response is reported complete exactly once`
    );
  }
});
