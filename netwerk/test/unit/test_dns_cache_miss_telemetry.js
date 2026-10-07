/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Tests the DNS cache-miss telemetry added in bug 2072119:
//   dns.cache_miss_reason  (absent / expired / refresh, keyed by family)
//   dns.negative_eviction  (premature / expired, keyed by family)

/* import-globals-from head_trr.js */

let trrServer;

add_setup(async function setup() {
  trr_test_setup();
  Services.fog.initializeFOG();
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
    Services.prefs.clearUserPref("network.dnsCacheEntries");
    if (trrServer) {
      await trrServer.stop();
    }
    trr_clear_prefs();
  });
});

function missCount(family, category) {
  return Glean.dns.cacheMissReason.get(family, category).testGetValue() ?? 0;
}

function evictionCount(family, category) {
  return Glean.dns.negativeEviction.get(family, category).testGetValue() ?? 0;
}

add_task(async function test_cache_miss_reason() {
  Services.dns.clearCache(true);

  const HOST = "cache-miss.example.com";
  // A-only host, resolved with IPv6 disabled, so the record family is "ipv4".
  await trrServer.registerDoHAnswers(HOST, "A", {
    answers: [
      { name: HOST, ttl: 55, type: "A", flush: false, data: "1.2.3.4" },
    ],
  });
  const flags = Ci.nsIDNSService.RESOLVE_DISABLE_IPV6;

  // First lookup: no cache entry exists -> "absent".
  let absentBefore = missCount("ipv4", "absent");
  await new TRRDNSListener(HOST, { flags, expectedAnswer: "1.2.3.4" });
  Assert.equal(
    missCount("ipv4", "absent"),
    absentBefore + 1,
    "first lookup is recorded as an absent miss"
  );

  // Second lookup is a cache hit and must not touch the miss metric.
  let absentAfterHit = missCount("ipv4", "absent");
  await new TRRDNSListener(HOST, { flags, expectedAnswer: "1.2.3.4" });
  Assert.equal(
    missCount("ipv4", "absent"),
    absentAfterHit,
    "a cache hit records no miss"
  );

  // Bypassing the cache on a still-valid entry -> "refresh".
  let refreshBefore = missCount("ipv4", "refresh");
  await new TRRDNSListener(HOST, {
    flags: flags | Ci.nsIDNSService.RESOLVE_BYPASS_CACHE,
    expectedAnswer: "1.2.3.4",
  });
  Assert.equal(
    missCount("ipv4", "refresh"),
    refreshBefore + 1,
    "a cache-bypass lookup on a valid entry is recorded as a refresh"
  );
});

add_task(async function test_negative_eviction() {
  Services.dns.clearCache(true);
  // Shrink the cache so a handful of negative entries forces eviction.
  Services.prefs.setIntPref("network.dnsCacheEntries", 2);

  let prematureBefore = evictionCount("ipv6", "premature");

  // Create several distinct negative AAAA (NODATA) records, resolving with
  // IPv4 disabled so each record's family is "ipv6". They are evicted while
  // still within their (long) negative lifetime, i.e. "premature".
  const COUNT = 12;
  for (let i = 0; i < COUNT; i++) {
    const host = `neg-evict-${i}.example.com`;
    await trrServer.registerDoHAnswers(host, "AAAA", { answers: [] });
    await new TRRDNSListener(host, {
      flags: Ci.nsIDNSService.RESOLVE_DISABLE_IPV4,
      expectedSuccess: false,
    });
  }

  Assert.greater(
    evictionCount("ipv6", "premature"),
    prematureBefore,
    "size-driven eviction of valid negative records is recorded as premature"
  );
});
