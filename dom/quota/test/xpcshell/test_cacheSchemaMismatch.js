/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

/**
 * Verify that a stale caches.sqlite in an origin's cache/ directory does not
 * kill temporary storage initialization. This reproduces the CI failure seen
 * with conditioned profiles where the cache DB schema version differs from
 * kLatestSchemaVersion.
 */

async function testSteps() {
  const origin = "https+++www.example.com";
  const originDirPath = "storage/default/" + origin;
  const cacheDirPath = originDirPath + "/cache";
  const cachesSQLitePath = cacheDirPath + "/caches.sqlite";

  Services.prefs.setBoolPref("dom.quotaManager.loadQuotaFromCache", false);
  Services.fog.initializeFOG();

  let request = init();
  await requestFinished(request);

  async function runScenario(schemaVersion, label, expectedLabel) {
    Services.fog.testResetFOG();

    info("Creating origin and cache directory structure");

    let cacheDir = getRelativeFile(cacheDirPath);
    cacheDir.create(Ci.nsIFile.DIRECTORY_TYPE, parseInt("0755", 8));

    info(`Creating caches.sqlite with schema version ${schemaVersion}`);

    let dbFile = getRelativeFile(cachesSQLitePath);
    let conn = Services.storage.openUnsharedDatabase(dbFile);
    // Match the pragma setup that InitializeConnection does for real cache DBs,
    // so that the debug-only auto_vacuum check passes.
    conn.executeSimpleSQL("PRAGMA auto_vacuum = INCREMENTAL;");
    conn.executeSimpleSQL("PRAGMA journal_mode = WAL;");
    if (schemaVersion > 0) {
      // Create the tables that the usage queries read from so that a
      // mismatched-version DB behaves like a real one (tables present, just a
      // different schema version number).
      conn.executeSimpleSQL(
        "CREATE TABLE IF NOT EXISTS entries (" +
          "id INTEGER NOT NULL PRIMARY KEY, " +
          "response_padding_size INTEGER NULL" +
          ")"
      );
      conn.executeSimpleSQL(
        "CREATE TABLE IF NOT EXISTS usage_info (" +
          "id INTEGER NOT NULL PRIMARY KEY, " +
          "total_disk_usage INTEGER NOT NULL" +
          ")"
      );
      conn.executeSimpleSQL("INSERT OR IGNORE INTO usage_info VALUES(1, 0)");
      conn.schemaVersion = schemaVersion;
    }
    conn.close();

    info("Calling initTemporaryStorage - should not throw");

    request = initTemporaryStorage();
    try {
      await requestFinished(request);
      info("initTemporaryStorage succeeded");
    } catch (e) {
      ok(
        false,
        `initTemporaryStorage should not fail for ${label}. ` +
          `Got: ${e.resultName}`
      );
    }

    if (expectedLabel) {
      Assert.equal(
        Glean.cache.schemaInitError[expectedLabel].testGetValue(),
        1,
        `Should record one ${expectedLabel} schema init error for ${label}`
      );
    } else {
      Assert.equal(
        Glean.cache.schemaInitError.future_version.testGetValue(),
        undefined,
        `Should not record future_version error for ${label}`
      );
      Assert.equal(
        Glean.cache.schemaInitError.other.testGetValue(),
        undefined,
        `Should not record other error for ${label}`
      );
    }
  }

  const scenarios = [
    [99, "future schema version (99)", "future_version"],
    [30, "old but valid schema version (30)", "other"],
    [0, "no schema (version 0)", null],
  ];

  for (const [version, label, expectedLabel] of scenarios) {
    info(`Scenario: ${label}`);
    await runScenario(version, label, expectedLabel);

    info("Clearing for next scenario");
    request = clear();
    await requestFinished(request);

    request = init();
    await requestFinished(request);
  }
}
