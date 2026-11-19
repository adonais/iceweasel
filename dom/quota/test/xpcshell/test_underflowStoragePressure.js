/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

/**
 * This test verifies that an underflow of the global temporary storage usage
 * doesn't make the storage unusable for all origins (bug 2065499).
 *
 * The underflow is simulated by setting a cached origin usage lower than the
 * real one in storage.sqlite, and then removing the real data. The values are
 * kept consistent so the cached values are used without a rescan.
 * We can't make the value negative/underflow right away because the saved
 * values are checked and fixed when quota manager starts.
 */

const { LocalStorageUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/localstorage/test/modules/LocalStorageUtils.sys.mjs"
);

const underflowedOrigin = "http://example.com";
const otherOrigin = "http://example.org";

function writeLocalStorage(principal, value = "bar") {
  const storage = LocalStorageUtils.createStorage(principal);
  try {
    storage.setItem("foo", value);
    Assert.ok(true, "Should not have thrown");
  } catch (ex) {
    Assert.ok(false, `Should not have thrown: ${ex}`);
  }
  storage.close();
}

async function testSteps() {
  const principal = getPrincipal(underflowedOrigin);

  await initStorageAndTemporaryStorage();

  info("Writing localStorage data");

  writeLocalStorage(principal, "x".repeat(1024 * 1024));

  info("Resetting to flush the usage to storage.sqlite");

  let request = reset();
  await requestFinished(request);

  info("Setting the cached origin usage to zero");

  setCachedOriginUsage(underflowedOrigin, 0, "L0");

  await initStorageAndTemporaryStorage();

  request = getCachedOriginUsage(principal);
  await requestFinished(request);

  // Make sure hacking the sqlite3 worked and that our fake update was taken
  // into account
  Assert.equal(request.result, 0, "Cached usage value should have been used");

  let storagePressureNotified = false;
  const observer = () => {
    storagePressureNotified = true;
  };
  Services.obs.addObserver(observer, "QuotaManager::StoragePressure");

  try {
    info("Removing localStorage data to make the global usage underflow");

    {
      const storage = LocalStorageUtils.createStorage(principal);
      // Ending an explicit snapshot is synchronous, so the usage decrease is
      // applied before the next writes.
      storage.beginExplicitSnapshot();
      storage.removeItem("foo");
      storage.endExplicitSnapshot();
      storage.close();
    }

    info("Writing localStorage data for the underflowed origin");

    writeLocalStorage(principal);

    info("Writing localStorage data for another origin");

    writeLocalStorage(getPrincipal(otherOrigin));

    request = getCachedOriginUsage(getPrincipal(otherOrigin));
    await requestFinished(request);

    Assert.greater(request.result, 0, "Other origin usage should be positive");
  } finally {
    Services.obs.removeObserver(observer, "QuotaManager::StoragePressure");
  }

  Assert.ok(!storagePressureNotified, "Should not have notified pressure");

  request = clear();
  await requestFinished(request);
}
