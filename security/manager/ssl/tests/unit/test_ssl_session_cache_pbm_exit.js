// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/
"use strict";

// Tests that the private-browsing SSL session cache entries are removed (and
// normal-browsing entries preserved) when "last-pb-context-exited" fires
// (Bug 2017877).

do_get_profile();

const GOOD_DOMAIN = "good.include-subdomains.pinning.example.com";
const PRIVATE_BROWSING_OA = { privateBrowsingId: 1 };

const statsPtr = getSSLStatistics();
const toInt32 = ctypes.Int64.lo;

function run_test() {
  add_tls_server_setup("BadCertAndPinningServer", "bad_certs");

  // Phase 1: Make an initial connection to populate the session cache.
  add_connection_test(GOOD_DOMAIN, PRErrorCodeSuccess, clearSessionCache);

  // Phase 2: Verify session resumption works (cache is populated).
  let hitsBeforeResume;
  let missesBeforeResume;
  add_connection_test(
    GOOD_DOMAIN,
    PRErrorCodeSuccess,
    function () {
      let stats = statsPtr.contents;
      hitsBeforeResume = toInt32(stats.sch_sid_cache_hits);
      missesBeforeResume = toInt32(stats.sch_sid_cache_misses);
    },
    function (transportSecurityInfo) {
      ok(transportSecurityInfo.resumed, "Second connection should be resumed");
      let stats = statsPtr.contents;
      equal(
        toInt32(stats.sch_sid_cache_hits),
        hitsBeforeResume + 1,
        "Should have one additional cache hit"
      );
      equal(
        toInt32(stats.sch_sid_cache_misses),
        missesBeforeResume,
        "Should have no additional cache misses"
      );
    }
  );

  // Phase 3: Make a private-browsing connection.
  add_connection_test(
    GOOD_DOMAIN,
    PRErrorCodeSuccess,
    null,
    null,
    null,
    PRIVATE_BROWSING_OA
  );

  // Phase 4: Fire "last-pb-context-exited" to clear PBM session state.
  add_test(function () {
    Services.obs.notifyObservers(null, "last-pb-context-exited");
    run_next_test();
  });

  // Phase 5: Verify that normal-browsing sessions survive PBM exit.
  // last-pb-context-exited clears SSLTokensCache PBM entries only, so the
  // non-PBM ticket from phase 1 is still available and the connection resumes.
  add_connection_test(
    GOOD_DOMAIN,
    PRErrorCodeSuccess,
    null,
    function (transportSecurityInfo) {
      ok(
        transportSecurityInfo.resumed,
        "Non-PBM session should survive last-pb-context-exited"
      );
    }
  );

  // Phase 6: Verify that the PBM session was evicted.
  add_connection_test(
    GOOD_DOMAIN,
    PRErrorCodeSuccess,
    null,
    function (transportSecurityInfo) {
      ok(
        !transportSecurityInfo.resumed,
        "PBM session should be evicted by last-pb-context-exited"
      );
    },
    null,
    PRIVATE_BROWSING_OA
  );

  run_next_test();
}
