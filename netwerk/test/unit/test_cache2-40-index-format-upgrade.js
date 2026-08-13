"use strict";

// When the on-disk index was written by a different (older) format version, it
// must be detected on startup and discarded, and the index rebuilt from the
// entry files, leaving all entries accessible. This guards the index format
// version bump that added lastFetched/fetchCount to the record.
//
// nsICacheTesting.shutdownCacheForTesting()/startupCacheForTesting() simulate a
// restart in-process so the index is re-read from disk.

const COUNT = 5;
// The version is the first 4 bytes of the index header, big-endian. Any value
// different from the current kIndexVersion forces the index to be discarded.
const OLD_VERSION = [0x00, 0x00, 0x00, 0x0c];

function entryURL(i) {
  return "http://upgrade/" + i;
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

add_task(async function test_index_format_mismatch_rebuilds() {
  do_get_profile();

  // Write the index eagerly and rebuild without the post-startup delay.
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
  for (let i = 0; i < COUNT; i++) {
    await openEntry(NORMAL, "meta" + i, "data" + i, entryURL(i));
  }
  await flushCache();
  Assert.ok(await waitForIndexFile(), "index written to disk");

  // Shut the cache down so the index is clean on disk, then stamp an older
  // format version into its header.
  let testing = Services.cache2.QueryInterface(Ci.nsICacheTesting);
  testing.shutdownCacheForTesting();

  let buf = await IOUtils.read(indexFilePath());
  for (let i = 0; i < OLD_VERSION.length; i++) {
    buf[i] = OLD_VERSION[i];
  }
  await IOUtils.write(indexFilePath(), buf);

  // Start back up: the version mismatch must be detected and the index rebuilt.
  testing.startupCacheForTesting();
  await new Promise(wait_for_cache_index);

  let recovered = 0;
  for (let i = 0; i < COUNT; i++) {
    await openEntry(NORMAL, "meta" + i, "data" + i, entryURL(i));
    recovered++;
  }
  Assert.equal(
    recovered,
    COUNT,
    "all entries readable after the index was rebuilt for a format mismatch"
  );
});
