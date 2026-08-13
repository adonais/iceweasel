"use strict";

// lastFetched/fetchCount are stored in the disk index and updated on every hit,
// so they survive a restart even though read hits no longer rewrite the entry
// metadata. Before this change the values lived only in the metadata, which is
// not rewritten on hits, so after a restart a reopened entry would report a
// stale (creation-time) fetchCount.
//
// The test bumps fetchCount with several opens, simulates a restart via
// nsICacheTesting, then verifies the reopened entry reports the durable count
// from the index rather than the stale on-disk metadata value.

const URL = "http://durable/";
const PRE_RESTART_OPENS = 5;

function openEntry(behavior, meta, data) {
  return new Promise(resolve => {
    asyncOpenCacheEntry(
      URL,
      "disk",
      Ci.nsICacheStorage.OPEN_NORMALLY,
      null,
      new OpenCallback(behavior, meta, data, resolve)
    );
  });
}

function flushCache() {
  return new Promise(resolve => {
    Services.cache2.QueryInterface(Ci.nsICacheTesting).flush({
      QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
      observe() {
        resolve();
      },
    });
  });
}

function indexFilePath() {
  let f = getDiskCacheDirectory();
  f.append("index");
  return f.path;
}

async function waitForIndexFile() {
  for (let i = 0; i < 100; i++) {
    if (await IOUtils.exists(indexFilePath())) {
      return true;
    }
    await new Promise(resolve => do_timeout(50, resolve));
  }
  return false;
}

add_task(async function test_fetchcount_survives_restart() {
  do_get_profile();

  // Persist the index eagerly so the durable fetchCount reaches disk.
  Services.prefs.setIntPref(
    "browser.cache.disk.index.min_unwritten_changes",
    1
  );
  Services.prefs.setIntPref("browser.cache.disk.index.min_dump_interval_ms", 0);

  // Create the entry, then open it several more times. Each open bumps
  // fetchCount in memory and the index, but does not rewrite the entry
  // metadata, so the on-disk metadata fetchCount stays at its creation value.
  let created = await openEntry(NEW | WAITFORWRITE, "meta", "data");
  Assert.equal(created.fetchCount, 1, "fresh entry has fetchCount 1");
  await new Promise(wait_for_cache_index);

  let last;
  for (let i = 1; i < PRE_RESTART_OPENS; i++) {
    last = await openEntry(NORMAL, "meta", "data");
  }
  Assert.equal(
    last.fetchCount,
    PRE_RESTART_OPENS,
    "fetchCount accumulated in-session"
  );

  await flushCache();
  Assert.ok(await waitForIndexFile(), "index written to disk");

  // Simulate a restart. The on-disk metadata still records the creation-time
  // fetchCount; the index records the durable one.
  let testing = Services.cache2.QueryInterface(Ci.nsICacheTesting);
  testing.shutdownCacheForTesting();
  testing.startupCacheForTesting();
  await new Promise(wait_for_cache_index);

  // Reopen: the entry is seeded from the index, so fetchCount reflects the
  // durable value (and this open bumps it once more). Without the index-backed
  // stats it would have reset to the stale metadata value (~2).
  let reopened = await openEntry(NORMAL, "meta", "data");
  Assert.greaterOrEqual(
    reopened.fetchCount,
    PRE_RESTART_OPENS,
    `fetchCount durable across restart (got ${reopened.fetchCount})`
  );
});
