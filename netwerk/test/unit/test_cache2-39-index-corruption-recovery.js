"use strict";

// A corrupt on-disk index must be detected when it is read and the cache must
// recover by rebuilding the index from the entry files, leaving all entries
// accessible. This matters more now that the index is the durable store for
// frecency across an unclean exit. Only recoverability is asserted: frecency may
// reset to the (possibly stale) per-entry metadata value after a rebuild.
//
// nsICacheTesting.shutdownCacheForTesting()/startupCacheForTesting() simulate a
// browser restart in-process, so the index is re-read from disk through the same
// parse / integrity-check / rebuild path as a real startup.

const COUNT = 5;

function entryURL(i) {
  return "http://corrupt/" + i;
}

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

add_task(async function test_corrupt_index_recovers() {
  do_get_profile();

  // Write the index eagerly so it is actually on disk to corrupt (the default
  // thresholds would not flush for just a handful of entries), and start the
  // post-startup index rebuild immediately rather than after the default delay.
  Services.prefs.setIntPref(
    "browser.cache.disk.index.min_unwritten_changes",
    1
  );
  Services.prefs.setIntPref("browser.cache.disk.index.min_dump_interval_ms", 0);
  Services.prefs.setIntPref(
    "browser.cache.disk.index.update_start_delay_ms",
    0
  );

  for (let i = 0; i < COUNT; i++) {
    await openEntry(NEW | WAITFORWRITE, "meta" + i, "data" + i, entryURL(i));
  }
  await new Promise(wait_for_cache_index);
  // Read hits dirty the index entries; with the eager prefs above this triggers
  // a write so the index is actually on disk to corrupt.
  for (let i = 0; i < COUNT; i++) {
    await openEntry(NORMAL, "meta" + i, "data" + i, entryURL(i));
  }
  await flushCache();

  Assert.ok(await waitForIndexFile(), "index written to disk");

  // Shut the cache down (closes handles, writes a clean index), then corrupt the
  // on-disk index so the next startup fails its integrity check and rebuilds
  // from the entry files.
  let testing = Services.cache2.QueryInterface(Ci.nsICacheTesting);
  testing.shutdownCacheForTesting();

  let original = await IOUtils.read(indexFilePath());
  let garbage = new Uint8Array(Math.max(original.length, 128)).fill(0xab);
  await IOUtils.write(indexFilePath(), garbage);

  // Start back up and read the corrupt index; the cache must recover.
  testing.startupCacheForTesting();
  await new Promise(wait_for_cache_index);

  // Recovery: wait_for_cache_index above only returns once the index has been
  // rebuilt to the READY state, and every entry must still be readable with its
  // original data. An open below would fail (NOTFOUND / wrong data) if recovery
  // had lost the entry, so this is the core corruption-recovery guarantee.
  let recovered = 0;
  for (let i = 0; i < COUNT; i++) {
    await openEntry(NORMAL, "meta" + i, "data" + i, entryURL(i));
    recovered++;
  }
  Assert.equal(
    recovered,
    COUNT,
    "all entries readable after recovering from a corrupt index"
  );
});
