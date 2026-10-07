/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Regression test for bug 2062281.
//
// If the consumer that puts a cache entry into REVALIDATING never calls
// setValid()/setInvalid() on its handle -- e.g. it is cancelled or crashes
// without releasing it, as opposed to just closing normally, which would
// hit CacheEntry::OnHandleClosed() and revert the state -- the entry must
// not stay wedged in REVALIDATING forever. Every later same-URL consumer
// would otherwise park indefinitely (in production, each such consumer is
// only rescued by nsHttpChannel's independent per-channel
// network.cache.entry_wait_timeout_ms backstop, so every single one of them
// pays that wait). Here we simulate the stranded revalidator by holding its
// handle alive without ever calling setValid(), and verify a later consumer
// completes once the entry has been wedged for longer than
// network.cache.entry_wait_timeout_ms, without needing its own extra wait.
//
// A second scenario below covers the non-wedged success path: if the
// revalidator calls setValid() well within network.cache.entry_wait_timeout_ms,
// a consumer that arrives while the entry is REVALIDATING must be released by
// that setValid() call, not by the self-heal timeout.

function run_test() {
  do_get_profile();

  Services.prefs.setIntPref("network.cache.entry_wait_timeout_ms", 300);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("network.cache.entry_wait_timeout_ms");
  });

  asyncOpenCacheEntry(
    "http://revalidating-hang/",
    "disk",
    Ci.nsICacheStorage.OPEN_NORMALLY,
    null,
    new OpenCallback(NEW, "m1", "d1", function () {
      // Strand a revalidator: it gets ENTRY_NEEDS_REVALIDATION (entry
      // transitions to REVALIDATING) and then just holds onto its handle
      // without ever calling setValid()/setInvalid(), simulating a consumer
      // that was cancelled or crashed before finishing revalidation.
      let strandedHandle = null;
      asyncOpenCacheEntry(
        "http://revalidating-hang/",
        "disk",
        Ci.nsICacheStorage.OPEN_NORMALLY,
        null,
        {
          QueryInterface: ChromeUtils.generateQI(["nsICacheEntryOpenCallback"]),
          onCacheEntryCheck() {
            return Ci.nsICacheEntryOpenCallback.ENTRY_NEEDS_REVALIDATION;
          },
          onCacheEntryAvailable(entry, isNew, status) {
            Assert.equal(Cr.NS_OK, status);
            strandedHandle = entry;

            // Wait past the wedge timeout, then verify a later consumer for
            // the same URL is serviced right away, instead of parking
            // forever behind the stranded revalidator.
            do_timeout(500, function () {
              asyncOpenCacheEntry(
                "http://revalidating-hang/",
                "disk",
                Ci.nsICacheStorage.OPEN_NORMALLY,
                null,
                {
                  QueryInterface: ChromeUtils.generateQI([
                    "nsICacheEntryOpenCallback",
                  ]),
                  onCacheEntryCheck() {
                    return Ci.nsICacheEntryOpenCallback.ENTRY_WANTED;
                  },
                  onCacheEntryAvailable(laterEntry, laterIsNew, laterStatus) {
                    Assert.equal(Cr.NS_OK, laterStatus);
                    Assert.ok(
                      !!strandedHandle,
                      "keep the stranded handle alive until here"
                    );
                    run_setvalid_scenario();
                  },
                }
              );
            });
          },
        }
      );
    })
  );

  do_test_pending();
}

// The revalidator calls setValid() long before the wedge timeout elapses, so
// a consumer waiting behind it must be released by that setValid() call
// rather than by the self-heal timeout.
function run_setvalid_scenario() {
  asyncOpenCacheEntry(
    "http://revalidating-recovers/",
    "disk",
    Ci.nsICacheStorage.OPEN_NORMALLY,
    null,
    new OpenCallback(NEW, "m2", "d2", function () {
      let startTime = Date.now();

      asyncOpenCacheEntry(
        "http://revalidating-recovers/",
        "disk",
        Ci.nsICacheStorage.OPEN_NORMALLY,
        null,
        new OpenCallback(REVAL, "m2", "d2", function (entry) {
          // Validate well before network.cache.entry_wait_timeout_ms (300ms).
          do_timeout(50, function () {
            entry.setValid();
          });
        })
      );

      asyncOpenCacheEntry(
        "http://revalidating-recovers/",
        "disk",
        Ci.nsICacheStorage.OPEN_NORMALLY,
        null,
        new OpenCallback(NORMAL, "m2", "d2", function () {
          Assert.less(
            Date.now() - startTime,
            300,
            "consumer released by setValid(), not by the wedge self-heal timeout"
          );
          finish_cache2_test();
        })
      );
    })
  );
}
