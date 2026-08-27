/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

// Bug 2065480: Verify that QuotaManager detects and recovers from internal
// corruption in storage.sqlite that passes OpenUnsharedDatabase (header +
// B-tree check) but fails PRAGMA quick_check.
//
// The corruption we inject matches the reported bug: we set the freelist page
// count in the SQLite header (offset 36-39) to a nonzero value while the
// actual freelist chain is empty (trunk pointer stays 0). This inconsistency
// is invisible to OpenUnsharedDatabase but caught by quick_check.

const { LocalStorageUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/localstorage/test/modules/LocalStorageUtils.sys.mjs"
);

const testOrigin = "http://example.com";

function runQuickCheck(storageFile) {
  const conn = Services.storage.openUnsharedDatabase(storageFile);
  const stmt = conn.createStatement("PRAGMA quick_check(1)");
  try {
    stmt.executeStep();
    return stmt.getString(0);
  } finally {
    stmt.finalize();
    conn.close();
  }
}

async function testSteps() {
  add_task(
    {
      pref_set: [
        ["dom.storage.testing", true],
        ["dom.storage.client_validation", false],
      ],
    },
    async function test_corruptFreelistRecovery() {
      // -- Phase 1: Create valid storage state --

      info("Clearing storage");
      let request = clear();
      await requestFinished(request);

      info("Creating localStorage data");
      const principal = getPrincipal(testOrigin);
      {
        const storage = LocalStorageUtils.createStorage(principal);
        storage.setItem("key1", "value1");
        storage.close();
      }

      info("Resetting to flush to storage.sqlite and close connection");
      request = reset();
      await requestFinished(request);

      // -- Phase 2: Corrupt the freelist count in the SQLite header --
      //
      // SQLite header layout (first 100 bytes of page 1):
      //   offset 32-35: first freelist trunk page number (0 = no freelist)
      //   offset 36-39: total number of freelist pages
      //
      // We set the freelist count to a nonzero value while the trunk pointer
      // stays 0. This makes the header internally inconsistent: it claims
      // free pages exist but the freelist chain is empty.
      //
      // OpenUnsharedDatabase reads the header but does NOT validate this
      // cross-reference. PRAGMA quick_check walks the freelist chain and
      // detects the mismatch — exactly the class of corruption from
      // bug 2065480 ("Freelist: size is 1 but should be 860").

      info("Verifying DB is healthy before corruption");
      const storageFile = getRelativeFile("storage.sqlite");
      {
        const result = runQuickCheck(storageFile);
        is(result, "ok", "DB should be clean before corruption");
      }

      // Remove WAL/SHM left from the verification open.
      for (const suffix of ["-wal", "-shm"]) {
        await IOUtils.remove(storageFile.path + suffix, { ignoreAbsent: true });
      }

      info("Corrupting storage.sqlite freelist count in header");
      const data = await IOUtils.read(storageFile.path);
      Assert.greater(data.length, 100, "storage.sqlite should exist");

      // Set freelist page count (offset 36-39, big-endian) to 5.
      // The actual freelist is empty (trunk at offset 32-35 is 0), so
      // quick_check will report "size is 0 but should be 5".
      data[36] = 0;
      data[37] = 0;
      data[38] = 0;
      data[39] = 5;
      await IOUtils.write(storageFile.path, data);

      // Remove WAL/SHM to ensure SQLite reads the corrupted main file.
      for (const suffix of ["-wal", "-shm"]) {
        await IOUtils.remove(storageFile.path + suffix, { ignoreAbsent: true });
      }

      // -- Phase 3: Verify the corruption passes open but fails quick_check --

      info("Verifying corruption passes open but fails quick_check");
      {
        const result = runQuickCheck(storageFile);
        Assert.notEqual(
          result,
          "ok",
          "quick_check should detect the freelist corruption"
        );
        info("quick_check result: " + result);
      }

      // Clean up WAL/SHM from the verification open.
      for (const suffix of ["-wal", "-shm"]) {
        await IOUtils.remove(storageFile.path + suffix, { ignoreAbsent: true });
      }

      // -- Phase 4: Initialize QM — should detect corruption and recover --

      info("Initializing storage (should detect corruption and rebuild)");
      request = init();
      await requestFinished(request);

      request = initTemporaryStorage();
      await requestFinished(request);

      // -- Phase 5: Verify localStorage works after recovery --

      info("Verifying localStorage works after recovery");
      {
        const storage = LocalStorageUtils.createStorage(principal);

        // Original data lives in per-origin ls/data.sqlite, not in
        // storage.sqlite, so it should survive the nuke-and-rebuild.
        is(
          storage.getItem("key1"),
          "value1",
          "Original localStorage data should survive corruption recovery"
        );

        storage.setItem("key2", "value2");
        is(
          storage.getItem("key2"),
          "value2",
          "New localStorage writes should work after recovery"
        );

        storage.close();
      }

      // -- Phase 6: Verify storage.sqlite is now clean --
      //
      // After the fix, QM should have nuked and rebuilt storage.sqlite
      // during init. Verify that the rebuilt file passes quick_check.

      info("Verifying storage.sqlite is clean after recovery");
      request = reset();
      await requestFinished(request);

      {
        const result = runQuickCheck(storageFile);
        is(
          result,
          "ok",
          "storage.sqlite should pass quick_check after QM recovery"
        );
      }
    }
  );
}
