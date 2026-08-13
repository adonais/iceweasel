/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Verifies that the speculative HTTPS RR prefetch issued by nsHttpChannel is
// reused by Happy Eyeballs instead of being re-fetched.
//
// The channel prefetch and Happy Eyeballs both resolve the HTTPS RR, but they
// used to do so under different OriginAttributes: the prefetch resolved under
// the HTTPS-RR attributes (partition key scheme forced to "https") while Happy
// Eyeballs resolves under the connection's network-state attributes. For a
// partitioned load whose partition key scheme is "http" these two keys differ,
// so the prefetch landed in a different DNS cache entry and Happy Eyeballs had
// to issue its own query -- two HTTPS queries reached the TRR server. Now the
// prefetch resolves under the connection's network-state attributes, so Happy
// Eyeballs hits the same cache entry and the server sees exactly one HTTPS
// query.

const { NodeHTTP2Server } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

let trrServer;
let h2Server;

// The origin host. Must differ from the TRR endpoint host below, which is
// resolved via the bootstrap address (no TRR query): only a distinct host is
// actually resolved through TRR and thus counted by the server.
const HOST = "alt1.example.com";
const TRR_HOST = "foo.example.com";

// Partition key whose scheme is "http". The HTTPS-RR OriginAttributes rewrites
// the scheme to "https", so the prefetch and the connection's network-state
// attributes only diverge when the partition key scheme isn't already "https".
// A document load would recompute the partition key from its own URI, so this
// must be a partitioned subresource load to keep the http scheme.
const PARTITION_KEY = "(http,example.org)";

// HTTPS RR queries for a non-default port are sent under a port-prefixed name.
function httpsRRName() {
  return `_${h2Server.port()}._https.${HOST}`;
}

add_setup(async function () {
  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  addCertFromFile(certdb, "http2-ca.pem", "CTu,u,u");

  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);
  Services.prefs.setBoolPref("network.dns.use_https_rr_as_altsvc", true);
  // Avoid speculative connections issuing their own lookups and muddying the
  // per-host query counts.
  Services.prefs.setIntPref("network.http.speculative-parallel-limit", 0);

  trrServer = new TRRServer();
  await trrServer.start();
  trr_test_setup();
  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://${TRR_HOST}:${trrServer.port()}/dns-query`
  );

  h2Server = new NodeHTTP2Server();
  await h2Server.start();
  await h2Server.registerPathHandler("/", (_req, resp) => {
    resp.writeHead(200, { "Content-Type": "text/plain" });
    resp.end("ok");
  });

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.dns.use_https_rr_as_altsvc");
    Services.prefs.clearUserPref("network.http.speculative-parallel-limit");
    trr_clear_prefs();
    if (trrServer) {
      await trrServer.stop();
    }
    if (h2Server) {
      await h2Server.stop();
    }
  });
});

async function resetState() {
  Services.obs.notifyObservers(null, "net:cancel-all-connections");
  let nssComponent = Cc["@mozilla.org/network/ssl-tokens-cache;1"].getService(
    Ci.nsISSLTokensCache
  );
  await nssComponent.asyncClearSSLExternalAndInternalSessionCache();
  Services.dns.clearCache(true);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  // Reset the TRR server's per-host request counts.
  await trrServer.execute("global.dns_query_counts = {}");
}

async function registerAnswers() {
  await trrServer.registerDoHAnswers(httpsRRName(), "HTTPS", {
    answers: [
      {
        name: httpsRRName(),
        ttl: 55,
        type: "HTTPS",
        flush: false,
        data: {
          priority: 1,
          name: HOST,
          values: [{ key: "alpn", value: ["h2"] }],
        },
      },
    ],
  });
  await trrServer.registerDoHAnswers(HOST, "A", {
    answers: [
      { name: HOST, ttl: 55, type: "A", flush: false, data: "127.0.0.1" },
    ],
  });
  await trrServer.registerDoHAnswers(HOST, "AAAA", {
    answers: [{ name: HOST, ttl: 55, type: "AAAA", flush: false, data: "::1" }],
  });
}

async function openChannel() {
  // A third-party subresource of an http first party. The http first party
  // gives a partition key with the "http" scheme, which is what makes the
  // HTTPS-RR attributes (scheme forced to "https") diverge from the
  // connection's network-state attributes. The triggering principal must not
  // be the system principal, otherwise HTTPS RR is disallowed for a
  // non-document load (see nsHttpChannel::OnBeforeConnect).
  let principal = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI("http://example.org/"),
    {}
  );
  let chan = NetUtil.newChannel({
    uri: `https://${HOST}:${h2Server.port()}/`,
    loadingPrincipal: principal,
    triggeringPrincipal: principal,
    securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.loadInfo.originAttributes = { partitionKey: PARTITION_KEY };

  let status = await new Promise(resolve => {
    chan.asyncOpen({
      onStartRequest(_request) {},
      onDataAvailable(_request, stream, _offset, count) {
        read_stream(stream, count);
      },
      onStopRequest(request) {
        resolve(request.status);
      },
    });
  });
  return { chan, status };
}

// Happy Eyeballs reuses the channel's HTTPS RR prefetch: only one HTTPS query
// reaches the server, even though both the prefetch and Happy Eyeballs resolve
// the HTTPS RR.
add_task(async function test_he_reuses_https_rr_prefetch() {
  await resetState();
  await registerAnswers();

  let { chan, status } = await openChannel();
  Assert.equal(status, Cr.NS_OK, "request should succeed");
  Assert.equal(
    chan.QueryInterface(Ci.nsIHttpChannel).responseStatus,
    200,
    "response status should be 200"
  );

  Assert.equal(
    await trrServer.requestCount(httpsRRName(), "HTTPS"),
    1,
    "HE reused the prefetch: only one HTTPS query reached the server"
  );
});
