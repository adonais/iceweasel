/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

// A negative LocalStorage usage (the running counter in `database.usage`,
// mirrored into the `usage` file) can be persisted. When the
// origin is then initialized from disk (e.g. when CheckIfUsageIsConsistent
// fails, or after a build id change), usage must be recomputed from the rows
// and both persisted copies repaired, instead of the negative value being
// trusted (bug 1585978).

add_task(async function testSteps() {
  const key = "key1";
  const value = repeatChar(1000, ".");
  const expectedUsage = key.length + value.length;

  const principal = getDefaultPrincipal();
  const usageFile = getRelativeFile(
    "storage/default/http+++example.com/ls/usage"
  );
  const usageJournalFile = getRelativeFile(
    "storage/default/http+++example.com/ls/usage-journal"
  );
  const databaseFile = getRelativeFile(
    "storage/default/http+++example.com/ls/data.sqlite"
  );

  info("Setting prefs");
  // Make origin initialization go through QuotaClient::InitOrigin (which reads
  // the usage file) instead of trusting the storage.sqlite origin row written
  // at the previous clean shutdown.
  // Alternatively, we could modify the database to mark the origin as dirty, or
  // corrupt the usage value to an underflow value to force skipping the cache,
  // but changing the pref is easier, and already done in other tests, so it's
  // probably fine.
  Services.prefs.setBoolPref("dom.quotaManager.loadQuotaFromCache", false);

  info("Stage 1 - Storing an item and flushing it to disk");

  let request = clear();
  await requestFinished(request);

  let storage = getLocalStorage(principal);
  storage.setItem(key, value);

  request = resetClient(principal);
  await requestFinished(request);

  request = reset();
  await requestFinished(request);

  ok(usageFile.exists(), "Usage file exists");
  ok(!usageJournalFile.exists(), "No usage journal");
  is(
    await readUsageFromUsageFile(usageFile),
    expectedUsage,
    "Usage file holds the correct usage"
  );

  info("Stage 2 - Replacing the usage file content with a negative counter");

  // Cookie 0x420a420a followed by int64 -6, as UpdateUsageFile would write it.
  await IOUtils.write(
    usageFile.path,
    new Uint8Array([
      0x42, 0x0a, 0x42, 0x0a, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfa,
    ])
  );

  info("Stage 3 - Initializing the origin from disk");

  request = initStorage();
  await requestFinished(request);

  request = initTemporaryStorage();
  await requestFinished(request);

  request = initTemporaryOrigin(persistenceFor(principal), principal, false);
  await requestFinished(request);

  request = getCachedOriginUsage(principal);
  await requestFinished(request);

  is(request.result, expectedUsage, "In-memory usage recomputed from rows");

  request = getOriginUsage(principal);
  await requestFinished(request);

  is(
    request.result.usage,
    expectedUsage,
    "Reported usage recomputed from rows"
  );

  is(
    await readUsageFromUsageFile(usageFile),
    expectedUsage,
    "Usage file repaired"
  );

  info("Stage 4 - Checking the running counter in the database");

  request = reset();
  await requestFinished(request);

  const { Sqlite } = ChromeUtils.importESModule(
    "resource://gre/modules/Sqlite.sys.mjs"
  );
  const connection = await Sqlite.openConnection({
    path: databaseFile.path,
    readOnly: true,
  });
  try {
    const rows = await connection.execute("SELECT usage FROM database;");
    is(rows.length, 1, "One database row");
    is(
      rows[0].getResultByName("usage"),
      expectedUsage,
      "database.usage repaired"
    );
  } finally {
    await connection.close();
  }

  info("Stage 5 - Removing the item");

  storage = getLocalStorage(principal);
  storage.removeItem(key);

  request = resetClient(principal);
  await requestFinished(request);

  request = getOriginUsage(principal);
  await requestFinished(request);

  is(request.result.usage, 0, "Usage is zero after removing the item");
});
