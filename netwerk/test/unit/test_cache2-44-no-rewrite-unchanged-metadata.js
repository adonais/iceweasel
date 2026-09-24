"use strict";

// An entry file must only be rewritten when something about the entry actually
// changed. Two ways it used to be rewritten for nothing:
//
//  1. CacheFileMetadata::ParseMetadata() marked the freshly parsed metadata
//     dirty unconditionally, so the first read-only hit on an entry that had to
//     be reloaded from disk (after a restart, or after the entry was purged
//     from the memory pool) rewrote the whole metadata block.
//
//  2. CacheFileMetadata::SetElement() dirtied the metadata even when the
//     element already held that exact value. nsHttpChannel does this on every
//     HTTPS cache hit: it reads security-info out of the entry and stores it
//     straight back in CloseCacheEntry().
//
// Both are pure IO, and on Windows every rewrite makes on-access anti-malware
// software rescan the entry file (bug 2031458).

const URL = "http://no-rewrite/";
const META = "meta";
const META_CHANGED = "meta-changed";
const DATA = "0123456789";

// Opens the entry, optionally runs |fn| on it, and deliberately does not let
// the entry escape: a lingering JS reference would keep the CacheEntry alive
// and stop settle() below from purging (and thus flushing) it.
function openEntry(behavior, meta, fn) {
  return new Promise(resolve => {
    asyncOpenCacheEntry(
      URL,
      "disk",
      Ci.nsICacheStorage.OPEN_NORMALLY,
      null,
      new OpenCallback(behavior, meta, DATA, entry => {
        if (fn) {
          fn(entry);
        }
        resolve();
      })
    );
  });
}

// Purging the entry from the memory pool destroys its CacheFile, which writes
// the metadata back out if it is dirty. That is the barrier this test uses:
// after settle() the entry file on disk reflects every pending change.
async function settle() {
  Cu.forceGC();
  Cu.forceCC();
  Cu.forceGC();
  await new Promise(resolve => {
    Services.cache2.QueryInterface(Ci.nsICacheTesting).flush({
      QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
      observe() {
        resolve();
      },
    });
  });
}

async function readSingleEntryFile() {
  let dir = getDiskCacheDirectory();
  dir.append("entries");
  Assert.ok(dir.exists(), "entries directory exists");

  let files = [];
  let e = dir.directoryEntries;
  while (e.hasMoreElements()) {
    files.push(e.nextFile);
  }
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

add_task(async function test_entry_file_only_rewritten_on_real_change() {
  do_get_profile();

  // Persist the index eagerly so a reloaded entry can be seeded from it.
  Services.prefs.setIntPref(
    "browser.cache.disk.index.min_unwritten_changes",
    1
  );
  Services.prefs.setIntPref("browser.cache.disk.index.min_dump_interval_ms", 0);

  // Create the entry and get it fully written out.
  await openEntry(NEW | WAITFORWRITE, META);
  await new Promise(wait_for_cache_index);
  await settle();

  let baseline = await readSingleEntryFile();

  // Simulate a restart: the in-memory entry table is dropped, so the next open
  // has to read and parse the metadata back from the entry file.
  let testing = Services.cache2.QueryInterface(Ci.nsICacheTesting);
  testing.shutdownCacheForTesting();
  testing.startupCacheForTesting();
  await new Promise(wait_for_cache_index);

  // A plain read-only hit on the reloaded entry.
  await openEntry(NORMAL, META);
  await settle();

  Assert.ok(
    bytesEqual(baseline, await readSingleEntryFile()),
    "entry file unchanged after a read-only hit on a reloaded entry"
  );

  // Storing a metadata element with the value it already holds changes nothing.
  await openEntry(NORMAL, META, entry => {
    entry.setMetaDataElement("meto", META);
  });
  await settle();

  Assert.ok(
    bytesEqual(baseline, await readSingleEntryFile()),
    "entry file unchanged after re-storing an identical metadata element"
  );

  // Control: a metadata element that really changes is still written out, so
  // the assertions above are not passing just because nothing is ever written.
  await openEntry(NORMAL, META, entry => {
    entry.setMetaDataElement("meto", META_CHANGED);
  });
  await settle();

  Assert.ok(
    !bytesEqual(baseline, await readSingleEntryFile()),
    "entry file rewritten after a real metadata change"
  );

  // ...and the new value is what a later open sees.
  await openEntry(NORMAL, META_CHANGED);
});
