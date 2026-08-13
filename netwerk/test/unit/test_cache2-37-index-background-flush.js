"use strict";

// On Android the process is killed rather than cleanly shut down, so the disk
// cache index is persisted when the app is backgrounded ("application-background")
// to bound how much recently-updated frecency is lost. This verifies that the
// notification forces the index to be written even when the normal count/interval
// thresholds for an automatic write are not met.

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

add_task(async function test_application_background_flushes_index() {
  do_get_profile();

  // Suppress the automatic (count/interval-based) index writes so that the only
  // thing able to recreate the removed index file is the backgrounding flush.
  Services.prefs.setIntPref(
    "browser.cache.disk.index.min_unwritten_changes",
    100000
  );
  Services.prefs.setIntPref(
    "browser.cache.disk.index.min_dump_interval_ms",
    100000
  );
  Services.prefs.setIntPref(
    "browser.cache.disk.index.max_dump_interval_ms",
    100000
  );

  for (let i = 0; i < 5; i++) {
    await openEntry(NEW, "meta" + i, "data" + i, "http://bg/" + i);
  }
  await new Promise(wait_for_cache_index);
  await flushCache();

  // Dirty the index entries via read hits (frecency updates).
  for (let i = 0; i < 5; i++) {
    await openEntry(NORMAL, "meta" + i, "data" + i, "http://bg/" + i);
  }
  await flushCache();

  // Remove the on-disk index; its reappearance can now only be caused by the
  // backgrounding flush.
  await IOUtils.remove(indexFilePath(), { ignoreAbsent: true });
  Assert.ok(!(await IOUtils.exists(indexFilePath())), "index file removed");

  Services.obs.notifyObservers(null, "application-background");

  Assert.ok(
    await waitForIndexFile(),
    "index rewritten after application-background"
  );
  let info = await IOUtils.stat(indexFilePath());
  Assert.greater(info.size, 0, "rewritten index is non-empty");
});
