"use strict";

// Same coverage gap as test_cache2-44, for clearing by base domain: the entries
// in test_cache2-33 are still in the memory pools when the clear happens, so
// the base domain filtering in CacheFileContextEvictor::EvictEntries() is never
// reached. That filter matches an entry either by the base domain of its URI or
// by the base domain of its partitionKey, and both are checked here.

const BASE_DOMAIN = "example.net";
const ORIGIN = "http://example.net";
const SUBDOMAIN = "http://subdomain.example.net";
const OTHER = "http://foo.bar";
const PARTITION_KEY = "(http,example.net)";

function openEntry(behavior, meta, data, url, lci = null) {
  return new Promise(resolve => {
    asyncOpenCacheEntry(
      url,
      "disk",
      Ci.nsICacheStorage.OPEN_NORMALLY,
      lci,
      new OpenCallback(behavior, meta, data, resolve)
    );
  });
}

add_task(async function test_clear_base_domain_through_context_evictor() {
  do_get_profile();
  Services.prefs.setIntPref(
    "browser.cache.disk.index.update_start_delay_ms",
    0
  );

  let partitioned = Services.loadContextInfo.custom(false, {
    partitionKey: PARTITION_KEY,
  });

  await openEntry(NEW | WAITFORWRITE, "e1m", "e1d", ORIGIN + "/a");
  await openEntry(NEW | WAITFORWRITE, "s1m", "s1d", SUBDOMAIN + "/a");
  await openEntry(NEW | WAITFORWRITE, "f1m", "f1d", OTHER + "/a");
  await openEntry(NEW | WAITFORWRITE, "p1m", "p1d", OTHER + "/b", partitioned);

  await restart_cache2();
  Assert.equal(await count_cache2_entry_files(), 4, "four entries on disk");

  Services.cache2.clearBaseDomain(BASE_DOMAIN);
  await wait_for_context_eviction();

  Assert.equal(
    await count_cache2_entry_files(),
    1,
    "the evictor kept only the entry unrelated to the cleared base domain"
  );

  await openEntry(NEW, "e1m", "e1d", ORIGIN + "/a");
  await openEntry(NEW, "s1m", "s1d", SUBDOMAIN + "/a");
  await openEntry(NEW, "p1m", "p1d", OTHER + "/b", partitioned);
  await openEntry(NORMAL, "f1m", "f1d", OTHER + "/a");
});
