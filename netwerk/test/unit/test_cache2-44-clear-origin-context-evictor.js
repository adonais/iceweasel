"use strict";

// Clearing the disk cache for one origin is served by two independent code
// paths: CacheFileIOManager::EvictByContextInternal() dooms the entries that
// still have an active handle, and CacheFileContextEvictor::EvictEntries()
// walks the index and filters everything else by origin. test_cache2-32 only
// ever reaches the first path, because its entries are still in the memory
// pools when the clear happens. Bug 1591362 was an inverted origin comparison
// in the second path, which deleted every entry except the ones that were
// meant to go.
//
// Restarting the cache leaves the entries on disk with no active handles, so
// the clear below is served entirely by the context evictor.

const ORIGIN = "http://example.net";
const SUBDOMAIN = "http://subdomain.example.net";
const OTHER = "http://foo.bar";

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

add_task(async function test_clear_origin_through_context_evictor() {
  do_get_profile();
  Services.prefs.setIntPref(
    "browser.cache.disk.index.update_start_delay_ms",
    0
  );

  await openEntry(NEW | WAITFORWRITE, "e1m", "e1d", ORIGIN + "/a");
  await openEntry(NEW | WAITFORWRITE, "s1m", "s1d", SUBDOMAIN + "/a");
  await openEntry(NEW | WAITFORWRITE, "f1m", "f1d", OTHER + "/a");

  await restart_cache2();
  Assert.equal(await count_cache2_entry_files(), 3, "three entries on disk");

  let principal = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(ORIGIN),
    {}
  );
  Services.cache2.clearOriginsByPrincipal(principal);
  await wait_for_context_eviction();

  Assert.equal(
    await count_cache2_entry_files(),
    2,
    "the evictor deleted the file of the cleared origin and nothing else"
  );

  await openEntry(NEW, "e1m", "e1d", ORIGIN + "/a");
  await openEntry(NORMAL, "s1m", "s1d", SUBDOMAIN + "/a");
  await openEntry(NORMAL, "f1m", "f1d", OTHER + "/a");
});
