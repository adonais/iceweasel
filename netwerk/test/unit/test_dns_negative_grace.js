/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// network.dnsNegativeCacheExpirationGracePeriod: a negative DNS entry that has
// passed its TTL is served (optimistic DNS) during a grace period, with the
// same behavior as a positive entry:
//   - Address (A/AAAA) negatives are served stale AND refreshed in the
//     background by the resolver, so a host that gains the missing family is
//     picked up (AddrHostRecord::RefreshForNegativeResponse() is true).
//   - By-type (HTTPS/TXT) negatives are served stale but not refreshed by the
//     resolver -- like positive by-type records, which also don't grace-refresh
//     (TypeHostRecord::RefreshForNegativeResponse() is false); revalidation is
//     left to the consumer (e.g. Happy Eyeballs).

/* import-globals-from head_trr.js */

var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const HOST = "neg-grace.example.com";
const NEG_TTL = 1; // seconds
const GRACE = 600; // seconds
const REFRESH_DELAY_MS = 1000;

let trrServer;

class Listener {
  constructor() {
    this.promise = new Promise(resolve => {
      this.resolve = resolve;
    });
  }
  onLookupComplete(inRequest, inRecord, inStatus) {
    this.resolve([inRecord, inStatus]);
  }
  then() {
    return this.promise.then.apply(this.promise, arguments);
  }
}
Listener.prototype.QueryInterface = ChromeUtils.generateQI(["nsIDNSListener"]);

function resolve(type, flags) {
  let listener = new Listener();
  Services.dns.asyncResolve(
    HOST,
    type,
    flags,
    null,
    listener,
    Services.tm.currentThread,
    {}
  );
  return listener;
}

// Medium priority: address negatives are only reused for high-priority queries
// when Happy Eyeballs is enabled (AddrHostRecord::HasUsableResultInternal). We
// exercise the resolver's grace behavior directly, independent of HE, so use a
// non-high-priority query.
function resolveAAAA() {
  return resolve(
    Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
    Ci.nsIDNSService.RESOLVE_DISABLE_IPV4 |
      Ci.nsIDNSService.RESOLVE_PRIORITY_MEDIUM
  );
}

function resolveHTTPS() {
  return resolve(
    Ci.nsIDNSService.RESOLVE_TYPE_HTTPSSVC,
    Ci.nsIDNSService.RESOLVE_PRIORITY_MEDIUM
  );
}

add_setup(async function setup() {
  trr_test_setup();
  // Keep Happy Eyeballs out of it so we observe only the resolver's behavior,
  // and use TRR_ONLY so every lookup is a countable DoH request.
  Services.prefs.setBoolPref("network.http.happy_eyeballs_enabled", false);
  Services.prefs.setIntPref("network.trr.mode", 3);
  Services.prefs.setIntPref("network.dnsNegativeCacheExpiration", NEG_TTL);
  Services.prefs.setIntPref(
    "network.dns.negative_ttl_for_type_record",
    NEG_TTL
  );
  Services.prefs.setIntPref(
    "network.dnsNegativeCacheExpirationGracePeriod",
    GRACE
  );

  trrServer = new TRRServer();
  await trrServer.start();
  Services.prefs.setCharPref(
    "network.trr.uri",
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  // Positive A so the host exists; the negatives we exercise are AAAA / HTTPS.
  await trrServer.registerDoHAnswers(HOST, "A", {
    answers: [
      { name: HOST, ttl: 55, type: "A", flush: false, data: "1.2.3.4" },
    ],
  });

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("network.http.happy_eyeballs_enabled");
    Services.prefs.clearUserPref("network.trr.mode");
    Services.prefs.clearUserPref("network.trr.uri");
    Services.prefs.clearUserPref("network.dnsNegativeCacheExpiration");
    Services.prefs.clearUserPref("network.dns.negative_ttl_for_type_record");
    Services.prefs.clearUserPref(
      "network.dnsNegativeCacheExpirationGracePeriod"
    );
    trr_clear_prefs();
    await trrServer.stop();
  });
});

// Address negative: served stale during grace and refreshed in the background,
// same as a positive entry.
add_task(async function test_addr_negative_served_from_grace_and_refreshed() {
  Services.dns.clearCache(true);
  await trrServer.registerDoHAnswers(HOST, "AAAA", { answers: [] });

  let [, status1] = await resolveAAAA();
  Assert.equal(status1, Cr.NS_ERROR_UNKNOWN_HOST, "AAAA is initially negative");

  // The host gains a AAAA, but the answer is delayed so a stale serve can't
  // accidentally observe it.
  await trrServer.registerDoHAnswers(HOST, "AAAA", {
    answers: [{ name: HOST, ttl: 55, type: "AAAA", flush: false, data: "::1" }],
    delay: REFRESH_DELAY_MS,
  });

  // Age the negative past its TTL into the grace period.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, NEG_TTL * 1000 + 200));

  // Served from grace: the stale negative is returned immediately instead of
  // blocking on the (delayed) fresh answer.
  let [, status2] = await resolveAAAA();
  Assert.equal(
    status2,
    Cr.NS_ERROR_UNKNOWN_HOST,
    "stale negative served from grace, not the delayed positive"
  );

  // The serve also kicked a background refresh; wait for it to land ::1.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, REFRESH_DELAY_MS + 700));

  let [rec3, status3] = await resolveAAAA();
  Assert.equal(status3, Cr.NS_OK, "background refresh replaced the negative");
  rec3.QueryInterface(Ci.nsIDNSAddrRecord);
  Assert.equal(rec3.getNextAddrAsString(), "::1", "refreshed to the new AAAA");
});

// By-type negative: served stale during grace, but the resolver does not
// refresh it (no extra DoH query), matching positive by-type records.
add_task(async function test_type_negative_served_from_grace_no_refresh() {
  Services.dns.clearCache(true);
  await trrServer.registerDoHAnswers(HOST, "HTTPS", { answers: [] });

  let [, status1] = await resolveHTTPS();
  Assert.equal(
    status1,
    Cr.NS_ERROR_UNKNOWN_HOST,
    "HTTPS is initially negative"
  );

  // Age the negative past its TTL into the grace period.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, NEG_TTL * 1000 + 200));

  await trrServer.execute("global.dns_query_counts = {}");

  let [, status2] = await resolveHTTPS();
  Assert.equal(
    status2,
    Cr.NS_ERROR_UNKNOWN_HOST,
    "stale by-type negative served from grace"
  );

  // Give any (unwanted) background refresh time to reach the server.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 500));

  Assert.equal(
    await trrServer.requestCount(HOST, "HTTPS"),
    0,
    "by-type negative served purely from grace, with no resolver refresh"
  );
});
