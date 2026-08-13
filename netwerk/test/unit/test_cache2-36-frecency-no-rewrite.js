"use strict";

// A read-only cache hit must not rewrite the entry file. Frecency and the access
// stats (lastFetched/fetchCount) are kept in memory and in the central index;
// the per-entry file is only rewritten when its data or headers actually change.
// Rewriting it on every hit generates IO and triggers on-access anti-malware
// scans, which is what this change avoids.

const URL = "http://no-rewrite/";

function openEntry(behavior, meta, data, url = URL) {
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

function listEntryFiles() {
  let dir = getDiskCacheDirectory();
  dir.append("entries");
  Assert.ok(dir.exists(), "entries directory exists");
  let files = [];
  let e = dir.directoryEntries;
  while (e.hasMoreElements()) {
    files.push(e.nextFile);
  }
  return files;
}

async function readSingleEntryFile() {
  let files = listEntryFiles();
  Assert.equal(files.length, 1, "exactly one entry file on disk");
  return IOUtils.read(files[0].path);
}

function bytesEqual(a, b) {
  if (a.length != b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] != b[i]) {
      return false;
    }
  }
  return true;
}

add_task(async function test_no_rewrite_on_read_hit() {
  do_get_profile();

  // Create the entry and persist it to disk. WAITFORWRITE makes the callback
  // fire only after the data write completes; flushCache() then forces the
  // metadata to disk and closes the entry.
  await openEntry(NEW | WAITFORWRITE, "metadata", "0123456789");
  await new Promise(wait_for_cache_index);
  await flushCache();

  let baseline = await readSingleEntryFile();

  // Several read-only hits. Each updates frecency and lastFetched/fetchCount in
  // memory and the index. flushCache() purges the memory pools, which closes the
  // entry; under the old behavior a dirtied entry would be written back here.
  for (let i = 0; i < 3; i++) {
    await openEntry(NORMAL, "metadata", "0123456789");
    await flushCache();
  }

  let after = await readSingleEntryFile();

  Assert.ok(
    bytesEqual(baseline, after),
    "entry file is byte-identical after read-only hits (no metadata rewrite)"
  );
});
