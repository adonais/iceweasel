/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Regression test for the HTTP/2 DNS-coalescing key collision (bug 2059597):
// two requests from different partitions must not share a connection just
// because their 32-bit coalescing-key hashes collide.
//
// The key is "<peer>~<anon>:~<fallback>:<port>/[<OA suffix>]viaDNS", so the
// hardcoded partitions only collide at a fixed PORT. setup() re-derives both
// hashes, failing loudly if the key format ever changes.

"use strict";

const { NodeHTTP2Server } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

const override = Cc["@mozilla.org/network/native-dns-override;1"].getService(
  Ci.nsINativeDNSResolverOverride
);
const certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
  Ci.nsIX509CertDB
);

const PEER = "127.0.0.1"; // loopback, so this is the coalescing key's peer
const PORT = 51099;
const PARTITION_A = "(https,example.com)";
// Collides with PARTITION_A at PEER:PORT. Regenerate if the key or PORT
// changes (see the offline search in the browser proof,
// browser_h2_coalescing_hash_collision_mtls.js).
const PARTITION_B = "(https,proof-cff9-1000-proof-2244.com)";

// mfbt HashString/HashBytes over the coalescing key (mfbt/HashFunctions.h),
// only to prove the hardcoded partitions still collide.
function coalescingKeyHash(partition) {
  const suffix = ChromeUtils.originAttributesToSuffix({
    partitionKey: partition,
  });
  const key = `${PEER}~.:~.:${PORT}/[${suffix}]viaDNS`;
  const bytes = new TextEncoder().encode(key);
  const word = i =>
    (bytes[i] |
      (bytes[i + 1] << 8) |
      (bytes[i + 2] << 16) |
      (bytes[i + 3] << 24)) >>>
    0;
  const add = (h, v) =>
    Math.imul(0x9e3779b9, ((h << 5) | (h >>> 27)) ^ v) >>> 0;
  let h = 0;
  const complete = bytes.length - (bytes.length % 4);
  for (let i = 0; i < complete; i += 4) {
    h = add(h, word(i));
  }
  for (let i = complete; i < bytes.length; i++) {
    h = add(h, bytes[i]);
  }
  return h;
}

// Null if the fixed port could not be bound; the test then skips.
let server = null;

add_setup(async function setup() {
  do_get_profile();
  Services.prefs.setBoolPref("network.http.http2.enabled", true);
  // Keep the DNS-address membership check on, so only the identity check can
  // keep a colliding partition on its own connection.
  Services.prefs.setBoolPref("network.http.http2.aggressive_coalescing", false);
  addCertFromFile(certdb, "http2-ca.pem", "CTu,u,u");

  registerCleanupFunction(async () => {
    if (server) {
      await server.stop();
    }
    override.clearOverrides();
    Services.prefs.clearUserPref("network.http.http2.enabled");
    Services.prefs.clearUserPref("network.http.http2.aggressive_coalescing");
  });

  // coalescingKeyHash() assumes little-endian, as do all platforms we ship.
  const probe = new Uint32Array(new Uint8Array([1, 0, 0, 0]).buffer)[0];
  Assert.equal(probe, 1, "host is little-endian");

  Assert.equal(
    coalescingKeyHash(PARTITION_A),
    coalescingKeyHash(PARTITION_B),
    "the two hardcoded partitions still collide on the coalescing key hash; " +
      "if this fails, the coalescing key format changed -- regenerate " +
      "PARTITION_B (see file header)"
  );

  // start() hangs on a busy port instead of failing, so probe PORT first and
  // skip if it is taken.
  try {
    let probe = Cc["@mozilla.org/network/server-socket;1"].createInstance(
      Ci.nsIServerSocket
    );
    probe.init(PORT, true /* loopbackOnly */, -1);
    probe.close();
  } catch (e) {
    info(`Fixed collision port ${PORT} is unavailable: ${e}`);
    return;
  }

  let candidate = new NodeHTTP2Server();
  await candidate.start(PORT);
  if (candidate.port() !== PORT) {
    info(`Server bound ${candidate.port()} instead of ${PORT}`);
    await candidate.stop();
    return;
  }

  await candidate.registerPathHandler("/", (req, resp) => {
    // The client source port identifies the connection.
    const body = "ok";
    resp.writeHead(200, {
      "x-client-port": String(req.socket.remotePort),
      "Content-Type": "text/plain",
      "Content-Length": String(body.length),
    });
    resp.end(body);
  });
  server = candidate;
});

function makeChan(uri, partitionKey) {
  let chan = NetUtil.newChannel({
    uri,
    loadUsingSystemPrincipal: true,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.loadFlags = Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;
  chan.loadInfo.originAttributes = { partitionKey };
  return chan;
}

function clientPortOf(chan) {
  return new Promise((resolve, reject) => {
    chan.asyncOpen(
      new ChannelListener(
        (req, _buffer) => {
          try {
            Assert.equal(req.responseStatus, 200);
            resolve(parseInt(req.getResponseHeader("x-client-port"), 10));
          } catch (e) {
            reject(e);
          }
        },
        null,
        CL_ALLOW_UNKNOWN_CL
      )
    );
  });
}

add_task(
  async function test_hash_collision_across_partitions_does_not_coalesce() {
    if (!server) {
      info(`Skipping: fixed collision port ${PORT} was unavailable.`);
      return;
    }

    override.clearOverrides();
    Services.dns.clearCache(true);
    override.addIPOverride("foo.example.com", PEER);
    override.addIPOverride("alt1.example.com", PEER);

    // Establish partition A's connection; the second request marks it
    // experienced so it is registered for coalescing.
    const portA = await clientPortOf(
      makeChan(`https://foo.example.com:${PORT}/`, PARTITION_A)
    );
    const portA2 = await clientPortOf(
      makeChan(`https://foo.example.com:${PORT}/`, PARTITION_A)
    );
    Assert.equal(
      portA,
      portA2,
      "the connection is reused for the same identity"
    );

    // Partition B collides with A's hash but is a distinct identity, so it must
    // open its own connection rather than reuse A's.
    const portB = await clientPortOf(
      makeChan(`https://foo.example.com:${PORT}/`, PARTITION_B)
    );
    Assert.notEqual(
      portA,
      portB,
      "a colliding but distinct partition must not coalesce onto A's connection"
    );

    // Same identity, different host on the same cert must still coalesce.
    const altPortA = await clientPortOf(
      makeChan(`https://alt1.example.com:${PORT}/`, PARTITION_A)
    );
    Assert.equal(
      portA,
      altPortA,
      "same-identity cross-host coalescing still works"
    );
  }
);
