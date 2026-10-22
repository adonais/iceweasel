/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const { PrincipalUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/quota/test/modules/PrincipalUtils.sys.mjs"
);
const { QuotaUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/quota/test/modules/QuotaUtils.sys.mjs"
);
const { IndexedDBUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/indexedDB/test/modules/IndexedDBUtils.sys.mjs"
);

async function resetAndInitTemporaryStorage() {
  let request = Services.qms.reset();
  await QuotaUtils.requestFinished(request);

  request = Services.qms.init();
  await QuotaUtils.requestFinished(request);

  request = Services.qms.initTemporaryStorage();
  await QuotaUtils.requestFinished(request);
}

async function getCachedUsage(principal) {
  const request = Services.qms.getCachedUsageForPrincipal(principal);
  return QuotaUtils.requestFinished(request);
}

function getDatabaseFilenameBase(idbDirectory) {
  for (const file of idbDirectory.directoryEntries) {
    if (file.leafName.endsWith(".sqlite")) {
      return file.leafName.slice(0, -".sqlite".length);
    }
  }
  return null;
}

/**
 * This test verifies that a failure to remove an obsolete database (one with
 * an idb-deleting- marker file) doesn't fail temporary storage initialization,
 * that the files left behind still count towards the origin usage, and that
 * removing them later doesn't make the usage drift.
 */

/* exported testSteps */
async function testSteps() {
  const principal = PrincipalUtils.createPrincipal("https://example.com");
  const name = "obsoleteDatabaseRemovalFailure";

  info("Creating database");

  {
    const request = indexedDB.openForPrincipal(principal, name);
    request.onupgradeneeded = function (event) {
      const objectStore = event.target.result.createObjectStore("store");
      objectStore.add(new Blob([new Uint8Array(100000)]), 1);
    };
    const database = await IndexedDBUtils.requestFinished(request);
    database.close();
  }

  await resetAndInitTemporaryStorage();

  const usageBefore = await getCachedUsage(principal);
  Assert.greater(usageBefore, 0, "Origin has usage");

  info("Marking database as obsolete");

  const idbDirectory = getRelativeFile(
    "storage/default/https+++example.com/idb"
  );
  const filenameBase = getDatabaseFilenameBase(idbDirectory);
  Assert.ok(filenameBase, "Found database file");

  const markerFile = idbDirectory.clone();
  markerFile.append("idb-deleting-" + filenameBase);
  markerFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

  info("Initializing temporary storage with failing database removal");

  await QuotaUtils.withArtificialFailures(
    Ci.nsIQuotaArtificialFailure.CATEGORY_REMOVE_DATABASE_FILES,
    /* probability */ 100,
    Cr.NS_ERROR_FILE_ACCESS_DENIED,
    resetAndInitTemporaryStorage
  );

  Assert.ok(markerFile.exists(), "Marker file still exists");

  const usageWithLeftovers = await getCachedUsage(principal);
  Assert.equal(
    usageWithLeftovers,
    usageBefore,
    "Leftover database files count towards usage"
  );

  info("Deleting database");

  {
    const request = indexedDB.deleteForPrincipal(principal, name);
    await IndexedDBUtils.requestFinished(request);
  }

  Assert.ok(!markerFile.exists(), "Marker file was removed");

  const usageAfter = await getCachedUsage(principal);
  Assert.equal(usageAfter, 0, "Removing leftovers didn't make usage drift");
}
