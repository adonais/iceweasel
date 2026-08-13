/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Verifies that negative A/AAAA DNS cache entries are served from cache for
// their TTL without an asynchronous re-resolution on every use (bug 2049178),
// and that network.dns.refresh_negative_addr_on_use restores the old
// refresh-on-use behavior.

/* import-globals-from head_trr.js */

var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

let trrServer;

// A host that only has an A record, so the AAAA family resolves NODATA. This
// mirrors the common case in the bug: an IPv4-only host whose AAAA lookup is
// permanently negative.
const HOST = "negative-refresh.example.com";

add_setup(async function setup() {
  trr_test_setup();

  // Negative addr results are only reused (and thus eligible for the
  // refresh-on-use path) when Happy Eyeballs is enabled; otherwise high
  // priority negatives bypass the cache entirely (see
  // AddrHostRecord::HasUsableResultInternal).
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", true);

  trrServer = new TRRServer();
  await trrServer.start();
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  Services.prefs.setIntPref("network.trr.mode", Ci.nsIDNSService.MODE_TRRONLY);

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.dns.refresh_negative_addr_on_use");
    if (trrServer) {
      await trrServer.stop();
    }
    trr_clear_prefs();
  });
});

async function primeNegativeAAAA() {
  Services.dns.clearCache(true);
  await trrServer.execute("global.dns_query_counts = {}");
  await trrServer.registerDoHAnswers(HOST, "A", {
    answers: [
      { name: HOST, ttl: 55, type: "A", flush: false, data: "1.2.3.4" },
    ],
  });

  // Prime a positive A too: a negative for one family is only reused when the
  // host still resolves in the other family (mirrors HE, which looks up both).
  let a = await new TRRDNSListener(HOST, {
    flags: Ci.nsIDNSService.RESOLVE_DISABLE_IPV6,
    expectedAnswer: "1.2.3.4",
  });
  Assert.equal(a.inStatus, Cr.NS_OK, "A lookup succeeds");

  // Prime the negative AAAA cache entry with a single real query.
  let { inStatus } = await new TRRDNSListener(HOST, {
    flags: Ci.nsIDNSService.RESOLVE_DISABLE_IPV4,
    expectedSuccess: false,
  });
  Assert.equal(inStatus, Cr.NS_ERROR_UNKNOWN_HOST, "AAAA lookup is negative");
  Assert.equal(
    await trrServer.requestCount(HOST, "AAAA"),
    1,
    "the first lookup performs exactly one AAAA query"
  );
}

async function useNegativeAAAA(times) {
  for (let i = 0; i < times; i++) {
    await new TRRDNSListener(HOST, {
      flags: Ci.nsIDNSService.RESOLVE_DISABLE_IPV4,
      expectedSuccess: false,
    });
  }
  // Let any background re-resolution reach the server before we count.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
}

// Default behavior: the cached negative is reused without re-resolving.
add_task(async function default_does_not_refresh_negative_on_use() {
  await primeNegativeAAAA();
  await useNegativeAAAA(4);

  Assert.equal(
    await trrServer.requestCount(HOST, "AAAA"),
    1,
    "negative AAAA entry is served from cache without re-resolving on use"
  );
});

// With the pref set, each use kicks off a background re-resolution again.
add_task(async function pref_restores_refresh_on_use() {
  Services.prefs.setBoolPref("network.dns.refresh_negative_addr_on_use", true);
  await primeNegativeAAAA();
  await useNegativeAAAA(4);

  Assert.greater(
    await trrServer.requestCount(HOST, "AAAA"),
    1,
    "with the pref set, using a negative AAAA entry re-resolves in the background"
  );

  Services.prefs.clearUserPref("network.dns.refresh_negative_addr_on_use");
});

// A total negative (both families negative, e.g. a transient failure) must not
// be reused; the host must re-resolve on the next use instead.
add_task(async function total_negative_reresolves_on_use() {
  const TOTAL = "total-negative.example.com";
  Services.dns.clearCache(true);
  await trrServer.execute("global.dns_query_counts = {}");

  // No answers registered: both families resolve negative -> a total failure.
  let a = await new TRRDNSListener(TOTAL, {
    flags: Ci.nsIDNSService.RESOLVE_DISABLE_IPV6,
    expectedSuccess: false,
  });
  Assert.equal(a.inStatus, Cr.NS_ERROR_UNKNOWN_HOST, "A lookup is negative");
  let aaaa = await new TRRDNSListener(TOTAL, {
    flags: Ci.nsIDNSService.RESOLVE_DISABLE_IPV4,
    expectedSuccess: false,
  });
  Assert.equal(
    aaaa.inStatus,
    Cr.NS_ERROR_UNKNOWN_HOST,
    "AAAA lookup is negative"
  );

  // Compare relative counts: a negative lookup also probes the other family.
  let countBefore = await trrServer.requestCount(TOTAL, "AAAA");

  // The transient failure clears: the host now resolves over AAAA.
  await trrServer.registerDoHAnswers(TOTAL, "AAAA", {
    answers: [
      { name: TOTAL, ttl: 55, type: "AAAA", flush: false, data: "::1" },
    ],
  });

  // Must re-resolve (not reuse the total negative) and now succeed.
  let retry = await new TRRDNSListener(TOTAL, {
    flags: Ci.nsIDNSService.RESOLVE_DISABLE_IPV4,
    expectedAnswer: "::1",
  });
  Assert.equal(
    retry.inStatus,
    Cr.NS_OK,
    "total-negative host re-resolves and succeeds instead of reusing the negative"
  );
  Assert.greater(
    await trrServer.requestCount(TOTAL, "AAAA"),
    countBefore,
    "using a total negative re-resolves (a fresh AAAA query runs)"
  );
});

// An AF_UNSPEC lookup (the ordinary connect path, e.g. DnsAndConnectSocket) is
// not a Happy Eyeballs per-family lookup, so its negative must be reused from
// cache rather than re-resolved on every use. Regression test for bug 2052794,
// where forcing a refresh here made a dead host re-resolve on each connection.
add_task(async function unspec_negative_is_reused() {
  const UNSPEC = "unspec-negative.example.com";
  Services.dns.clearCache(true);
  await trrServer.execute("global.dns_query_counts = {}");

  // No answers registered: a default (AF_UNSPEC) lookup resolves negative.
  let first = await new TRRDNSListener(UNSPEC, { expectedSuccess: false });
  Assert.equal(
    first.inStatus,
    Cr.NS_ERROR_UNKNOWN_HOST,
    "default (AF_UNSPEC) lookup is negative"
  );

  let aBefore = await trrServer.requestCount(UNSPEC, "A");
  let aaaaBefore = await trrServer.requestCount(UNSPEC, "AAAA");

  // Repeated default lookups must be served from the cached negative.
  for (let i = 0; i < 4; i++) {
    let again = await new TRRDNSListener(UNSPEC, { expectedSuccess: false });
    Assert.equal(
      again.inStatus,
      Cr.NS_ERROR_UNKNOWN_HOST,
      "default (AF_UNSPEC) lookup stays negative"
    );
  }
  // Let any background re-resolution reach the server before we count.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));

  Assert.equal(
    await trrServer.requestCount(UNSPEC, "A"),
    aBefore,
    "AF_UNSPEC negative is reused without a fresh A query"
  );
  Assert.equal(
    await trrServer.requestCount(UNSPEC, "AAAA"),
    aaaaBefore,
    "AF_UNSPEC negative is reused without a fresh AAAA query"
  );
});
