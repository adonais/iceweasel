"use strict";

// The disk index is normally written back only once
// browser.cache.disk.index.min_unwritten_changes (300) entries are dirty. The
// max_dump_interval_ms safety net flushes the index once that interval elapses
// with any dirty entry, so recently-updated frecency is not lost under light
// browsing where the count threshold is never reached. This drives that path by
// making the count threshold unreachable and the max interval zero.

function openEntry(behavior, meta, data, url) {
  return new Promise(resolve => {
    asyncOpenCacheEntry(
      url,
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

add_task(async function test_max_dump_interval_safety_net() {
  do_get_profile();

  // Phase 1: suppress all automatic index writes (count and time thresholds all
  // unreachable) so the index file can be removed without an in-flight write
  // racing it back.
  Services.prefs.setIntPref(
    "browser.cache.disk.index.min_unwritten_changes",
    100000
  );
  Services.prefs.setIntPref("browser.cache.disk.index.min_dump_interval_ms", 0);
  Services.prefs.setIntPref(
    "browser.cache.disk.index.max_dump_interval_ms",
    100000
  );

  await openEntry(NEW, "meta", "data", "http://maxint/");
  await new Promise(wait_for_cache_index);
  await flushCache();

  await IOUtils.remove(indexFilePath(), { ignoreAbsent: true });
  Assert.ok(!(await IOUtils.exists(indexFilePath())), "index file removed");

  // Phase 2: enable the time-based safety net. The count threshold (100000) is
  // still unreachable, so a single dirty entry can only be written back via the
  // max-interval safety net.
  Services.prefs.setIntPref("browser.cache.disk.index.max_dump_interval_ms", 0);

  await openEntry(NORMAL, "meta", "data", "http://maxint/");
  await flushCache();
  // A second entry operation ensures WriteIndexToDiskIfNeeded is re-evaluated.
  await openEntry(NEW, "meta2", "data2", "http://maxint2/");
  await flushCache();

  Assert.ok(
    await waitForIndexFile(),
    "index flushed via the max-dump-interval safety net"
  );
});
