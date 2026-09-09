/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const { LocalStorageUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/localstorage/test/modules/LocalStorageUtils.sys.mjs"
);

const badUsage = -5;
// This is -5, interpreted as an unsigned integer.
// Quota DB stores client usages as a string, not integer, unlike usage.
const badClientUsagesText = "L18446744073709551611";

const testDomain = "http://example.com";

// Flags from dom/quota/DirectoryMetadata.h
const kFlagAccessed = 1 << 1;

async function initStorage() {
  info("Initializing");

  let request = init();
  await requestFinished(request);

  info("Initializing temporary storage");

  request = initTemporaryStorage();
  await requestFinished(request);
}

/**
 * Setup storage for the tests: init, put value, and return current (real) usage
 */
async function setupStorage() {
  const principal = getPrincipal(testDomain);

  info("Clearing");

  let request = clear();
  await requestFinished(request);

  info("Writing known localStorage data");

  {
    const storage = LocalStorageUtils.createStorage(principal);
    storage.setItem("foo", "bar");
    storage.close();
  }

  info("Resetting to flush real usage to storage.sqlite and .metadata-v2");

  request = reset();
  await requestFinished(request);

  await initStorage();

  info("Getting the real cached usage");

  request = getCachedOriginUsage(principal);
  await requestFinished(request);

  const realUsage = request.result;

  Assert.greater(realUsage, 0, "Real usage should be positive");

  info("Resetting to safely edit storage.sqlite and .metadata-v2");

  request = reset();
  await requestFinished(request);

  return realUsage;
}

function corruptL1Cache(badUsage, badClientUsagesText) {
  const storageFile = getRelativeFile("storage.sqlite");
  const connection = Services.storage.openUnsharedDatabase(storageFile);
  try {
    connection.executeSimpleSQL(
      `UPDATE origin SET client_usages = '${badClientUsagesText}', ` +
        `usage = ${badUsage}`
    );
  } finally {
    connection.close();
  }
}

function corruptL2Cache(
  badUsage,
  badClientUsagesText,
  clearAccessedFlag = false
) {
  const metadataFile = getRelativeFile(
    "storage/default/http+++example.com/.metadata-v2"
  );
  const fileStream = Cc[
    "@mozilla.org/network/file-input-stream;1"
  ].createInstance(Ci.nsIFileInputStream);
  fileStream.init(metadataFile, -1, -1, 0);
  const bufferedStream = Cc[
    "@mozilla.org/network/buffered-input-stream;1"
  ].createInstance(Ci.nsIBufferedInputStream);
  bufferedStream.init(fileStream, 512);
  const binaryIn = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
    Ci.nsIBinaryInputStream
  );
  binaryIn.setInputStream(bufferedStream);

  const lastAccessTime = binaryIn.read64();
  const persisted = binaryIn.readBoolean();
  const rawFlags = binaryIn.read32();
  const lastMaintenanceDate = binaryIn.read32();
  const suffix = binaryIn.readCString();
  const group = binaryIn.readCString();
  const storageOrigin = binaryIn.readCString();
  const isPrivate = binaryIn.readBoolean();
  const sentinel = binaryIn.read32();
  const quotaVersion = binaryIn.read32();
  // Don't read usage (read64) nor clientUsages (string): we don't need them
  // since we will overwrite them just below
  binaryIn.close();

  const outStream = Cc[
    "@mozilla.org/network/file-output-stream;1"
  ].createInstance(Ci.nsIFileOutputStream);
  outStream.init(metadataFile, -1, parseInt("0644", 8), 0);
  const binaryOut = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(
    Ci.nsIBinaryOutputStream
  );
  binaryOut.setOutputStream(outStream);

  binaryOut.write64(lastAccessTime);
  binaryOut.writeBoolean(persisted);
  binaryOut.write32(clearAccessedFlag ? rawFlags & ~kFlagAccessed : rawFlags);
  binaryOut.write32(lastMaintenanceDate);
  binaryOut.writeStringZ(suffix);
  binaryOut.writeStringZ(group);
  binaryOut.writeStringZ(storageOrigin);
  binaryOut.writeBoolean(isPrivate);
  binaryOut.write32(sentinel);
  binaryOut.write32(quotaVersion);
  binaryOut.write64(badUsage);
  binaryOut.writeStringZ(badClientUsagesText);

  binaryOut.close();
}

async function checkUsage(realUsage) {
  info("Verifying usage was corrected, not left underflowed");

  const principal = getPrincipal(testDomain);
  let request = getCachedOriginUsage(principal);
  await requestFinished(request);

  is(request.result, realUsage, "Usage should be restored to the real value");

  info("Resetting to verify the fix was persisted, not just recomputed");

  request = reset();
  await requestFinished(request);

  {
    const storageFile = getRelativeFile("storage.sqlite");
    const connection = Services.storage.openUnsharedDatabase(storageFile);
    const stmt = connection.createStatement("SELECT usage FROM origin");
    try {
      ok(stmt.executeStep(), "Origin row should exist");

      is(
        stmt.row.usage,
        realUsage,
        "Persisted usage should no longer be underflowed"
      );
    } finally {
      stmt.finalize();
      connection.close();
    }
  }
}

/**
 * Corrupt L1 and L2 caches by putting underflow usage values, and make sure the
 * values are still OK afterwards because the bad values shall have been notcied
 * and a full rescan shall have been performed
 */
async function testL1L2Corruption() {
  const realUsage = await setupStorage();
  info("Injecting a underflowed usage value into L1 and L2");

  corruptL1Cache(badUsage, badClientUsagesText);
  corruptL2Cache(badUsage, badClientUsagesText);

  info("Initializing; this should detect the inconsistency and rescan");
  await initStorage();

  await checkUsage(realUsage);
}

/**
 * Same as testL1L2Corruption, but also clear the mAccessed flag, to be sure
 * we're testing the CheckIfUsageIsConsistent check which should trigger a full
 * rescan (a full rescan is always performed when mAccessed is true, regardless
 * of whether the the usage values are consistent or not).
 */
async function testL1L2CorruptionUnaccessedOrigin() {
  const realUsage = await setupStorage();

  info("Corrupting L1 and L2, clearing mAccessed flag in L2");

  corruptL1Cache(badUsage, badClientUsagesText);
  corruptL2Cache(badUsage, badClientUsagesText, /* clearAccessed */ true);

  info("Initializing; this should detect the inconsistency and rescan");
  await initStorage();

  await checkUsage(realUsage);
}

/**
 * Verifies that an origin whose L1 (storage.sqlite) and L2 (.metadata-v2)
 * caches both carry the same underflowed usage value (consistent with each
 * other, but wrong compared to the real on-disk data) gets rescanned and
 * corrected on the next initialization, instead of the bad value sticking
 * around forever.
 */
async function testSteps() {
  add_task(testL1L2Corruption);
  add_task(testL1L2CorruptionUnaccessedOrigin);
}
