/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const { FileUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/quota/test/modules/FileUtils.sys.mjs"
);
const { PrincipalUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/quota/test/modules/PrincipalUtils.sys.mjs"
);
const { QuotaUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/quota/test/modules/QuotaUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

/**
 * This test verifies the behavior when a shutdown occurs during repository
 * initialization triggered by initTemporaryStorage.
 *
 * Test Setup & Procedure:
 * 1. Lazy Origin Initialization Disabled
 *    - With lazy origin initialization disabled, initTemporaryStorage
 *      performs full origin initialization for every origin via
 *      InitializeRepository.
 *
 * 2. Preparation of Existing Profile
 *    - Two origins are created so the repository walk has multiple entries.
 *
 * 3. Removal of Metadata Files
 *    - Metadata files are removed to force restoration, providing a way
 *      to check whether origin initialization has occurred.
 *
 * 4. Triggering Repository Initialization
 *    - The test triggers initTemporaryStorage which calls LoadQuota ->
 *      InitializeRepository, walking each origin directory.
 *
 * 5. Inducing a Controlled Shutdown
 *    - The test waits for the first origin to begin initialization.
 *    - Once initialization starts, shutdown is triggered.
 *    - A 2-second delay is introduced in origin initialization to ensure
 *      the shutdown signal has time to propagate.
 *
 * 6. Expected Behavior & Verification
 *    - Due to the shutdown, the second origin does not initialize.
 *    - Since active operations are not available during shutdown, the test
 *      verifies initialization by checking whether the metadata file has
 *      been restored for the given origin.
 */
async function testShutdownDuringRepositoryInitialization() {
  const principal1 = PrincipalUtils.createPrincipal("https://1.example.com");
  const principal2 = PrincipalUtils.createPrincipal("https://2.example.com");
  const metadata1 = FileUtils.getFile(
    "storage/default/https+++1.example.com/.metadata-v2"
  );
  const metadata2 = FileUtils.getFile(
    "storage/default/https+++2.example.com/.metadata-v2"
  );

  info("Clearing storage");

  {
    const request = Services.qms.clear();
    await QuotaUtils.requestFinished(request);
  }

  info("Initializing storage");

  {
    const request = Services.qms.init();
    await QuotaUtils.requestFinished(request);
  }

  info("Initializing temporary storage");

  {
    const request = Services.qms.initTemporaryStorage();
    await QuotaUtils.requestFinished(request);
  }

  info("Initializing temporary origin 1");

  {
    const request = Services.qms.initializeTemporaryOrigin(
      "default",
      principal1,
      /* aCreateIfNonExistent */ true
    );
    await QuotaUtils.requestFinished(request);
  }

  info("Initializing temporary origin 2");

  {
    const request = Services.qms.initializeTemporaryOrigin(
      "default",
      principal2,
      /* aCreateIfNonExistent */ true
    );
    await QuotaUtils.requestFinished(request);
  }

  info("Shutting down storage");

  {
    const request = Services.qms.reset();
    await QuotaUtils.requestFinished(request);
  }

  info("Reinitializing storage");

  {
    const request = Services.qms.init();
    await QuotaUtils.requestFinished(request);
  }

  info("Removing origin metadata");

  metadata1.remove(false);
  metadata2.remove(false);

  info("Starting temporary storage initialization");

  const initPromise = (async function () {
    const request = Services.qms.initTemporaryStorage();
    const promise = QuotaUtils.requestFinished(request);
    return promise;
  })();

  info("Waiting for origin initialization to start");

  await TestUtils.topicObserved("QuotaManager::OriginInitializationStarted");

  info("Starting shutdown");

  QuotaUtils.startShutdown();

  info("Waiting for temporary storage initialization to finish");

  try {
    await initPromise;
    Assert.ok(false, "Should have thrown");
  } catch (e) {
    Assert.ok(true, "Should have thrown");
    Assert.strictEqual(
      e.resultCode,
      Cr.NS_ERROR_ABORT,
      "Threw right result code"
    );
  }

  info("Metadata file for first origin exists: " + metadata1.exists());
  info("Metadata file for second origin exists: " + metadata2.exists());

  Assert.notEqual(
    metadata1.exists(),
    metadata2.exists(),
    "Only the first origin should have been initialized before shutdown"
  );
}

/* exported testSteps */
async function testSteps() {
  add_task(
    {
      pref_set: [
        ["dom.quotaManager.temporaryStorage.lazyOriginInitialization", false],
        ["dom.quotaManager.loadQuotaFromCache", false],
        ["dom.quotaManager.loadQuotaFromSecondaryCache", false],
        ["dom.quotaManager.originInitialization.pauseOnIOThreadMs", 2000],
      ],
    },
    testShutdownDuringRepositoryInitialization
  );
}
