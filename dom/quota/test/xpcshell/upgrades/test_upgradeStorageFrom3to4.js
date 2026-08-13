/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

/**
 * Verifies UpgradeCacheFrom3To4: schema version 3 → 4 in storage.sqlite,
 * which renames origin.accessed → origin.metadata_flags (packing the accessed
 * and dirty bits together with a shutdown-failure-derived dirty bit) and drops
 * origin.persisted.
 *
 * Three sub-cases are run against the same packaged profile:
 *   1. Happy path – storage.sqlite is present and has schema version 3.
 *   2. Missing storage.sqlite – falls back to per-origin .metadata-v2 scan.
 *   3. Empty storage.sqlite – falls back to per-origin .metadata-v2 scan.
 *
 * The packaged profile was produced by running make_upgradeStorageFrom3to4.js
 * against a Firefox built from main (kCacheVersion = 3):
 *   ./mach xpcshell-test \
 *     dom/quota/test/xpcshell/upgrades/make_upgradeStorageFrom3to4.js \
 *     --interactive
 */

const { IndexedDBUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/indexedDB/test/modules/IndexedDBUtils.sys.mjs"
);
const { LocalStorageUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/localstorage/test/modules/LocalStorageUtils.sys.mjs"
);
const { PrincipalUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/quota/test/modules/PrincipalUtils.sys.mjs"
);
const { QuotaUtils } = ChromeUtils.importESModule(
  "resource://testing-common/dom/quota/test/modules/QuotaUtils.sys.mjs"
);

const kPackage = "upgradeStorageFrom3to4_profile";

async function sandboxOp(principal, globalProperties, options, scriptSource) {
  const sandbox = new Cu.Sandbox(principal, {
    wantGlobalProperties: globalProperties,
    ...options,
  });

  const promise = new Promise(function (resolve, reject) {
    sandbox.resolve = resolve;
    sandbox.reject = reject;
  });

  Cu.evalInSandbox(
    `(async function() { return (${scriptSource}); })().then(resolve, reject);`,
    sandbox
  );

  return promise;
}

async function verifyOrigin(principal, originLabel, expectedPersisted) {
  info(`Verifying origin ${originLabel} (persisted=${expectedPersisted})`);

  // Persisted state must be preserved across migration. Skip for the system
  // principal: Services.qms.persisted() is only meaningful for
  // PERSISTENCE_TYPE_DEFAULT origins.
  if (expectedPersisted !== null) {
    const request = Services.qms.persisted(principal);
    const isPersisted = await QuotaUtils.requestFinished(request);
    Assert.equal(
      isPersisted,
      expectedPersisted,
      `${originLabel} persisted state`
    );
  }

  // IndexedDB: read back the seeded value.
  {
    const openRequest = indexedDB.openForPrincipal(principal, "db1");
    await openDBRequestSucceeded(openRequest);
    const db = openRequest.result;
    const value = await new Promise(function (resolve, reject) {
      const tx = db.transaction(["store1"], "readonly");
      const req = tx.objectStore("store1").get("seed");
      req.onsuccess = () => {
        db.close();
        resolve(req.result);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
    Assert.equal(value, `${originLabel}-idb`, `${originLabel} IDB value`);
  }

  // The system principal has no URI so localStorage, Cache API, and OPFS are
  // not seeded for it in the fixture; only IDB is verified above.
  if (principal.isSystemPrincipal) {
    return;
  }

  // localStorage: read back the seeded value.
  {
    const storage = LocalStorageUtils.createStorage(principal);
    const value = storage.getItem("key1");
    storage.close();
    Assert.equal(
      value,
      `${originLabel}-ls`,
      `${originLabel} localStorage value`
    );
  }

  // Cache API: read back via sandbox.
  {
    const value = await sandboxOp(
      principal,
      ["caches", "fetch"],
      {},
      `
        caches.open("c1").then(async function(cache) {
          const response = await cache.match(new Request("https://example/seed"));
          return response ? response.text() : null;
        })
      `
    );
    Assert.equal(
      value,
      `${originLabel}-cache`,
      `${originLabel} Cache API value`
    );
  }

  // OPFS: read back via sandbox.
  {
    const value = await sandboxOp(
      principal,
      ["storage"],
      { forceSecureContext: true },
      `
        storage.getDirectory().then(async function(root) {
          const fh = await root.getFileHandle("seed.txt");
          const file = await fh.getFile();
          return file.text();
        })
      `
    );
    Assert.equal(value, `${originLabel}-opfs`, `${originLabel} OPFS value`);
  }
}

// When storage.sqlite is missing or empty, QM creates a new one with
// storageVersion=0 and runs all storage upgrades (0→1→…→2.3). The 0→1
// upgrade unconditionally overwrites .metadata-v2 with mPersisted=false, so
// the persisted flag for example.com is lost in those cases.
async function runCase(
  caseName,
  mutateAfterInstall,
  expectedComPersisted = true
) {
  info(`Running case: ${caseName}`);

  info("Clearing storage");

  {
    const request = Services.qms.clear();
    await QuotaUtils.requestFinished(request);
  }

  info("Installing package");

  installPackage(kPackage);

  if (mutateAfterInstall) {
    await mutateAfterInstall();
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

  const orgPrincipal = PrincipalUtils.createPrincipal(
    "https://www.example.org"
  );
  const comPrincipal = PrincipalUtils.createPrincipal(
    "https://www.example.com"
  );

  await verifyOrigin(orgPrincipal, "example.org", false);
  await verifyOrigin(comPrincipal, "example.com", expectedComPersisted);

  const chromePrincipal = Services.scriptSecurityManager.getSystemPrincipal();
  await verifyOrigin(chromePrincipal, "chrome", null);
}

async function testSteps() {
  add_task(
    {
      pref_set: [
        ["dom.storage.testing", true],
        ["dom.storage.client_validation", false],
      ],
    },
    async function test_happyPath() {
      await runCase("happy path");
    }
  );

  add_task(
    {
      pref_set: [
        ["dom.storage.testing", true],
        ["dom.storage.client_validation", false],
      ],
    },
    async function test_missingStorageSqlite() {
      await runCase(
        "missing storage.sqlite",
        async function () {
          info("Removing storage.sqlite");
          const file = getRelativeFile("storage.sqlite");
          file.remove(false);
        },
        false
      );
    }
  );

  add_task(
    {
      pref_set: [
        ["dom.storage.testing", true],
        ["dom.storage.client_validation", false],
      ],
    },
    async function test_emptyStorageSqlite() {
      await runCase(
        "empty storage.sqlite",
        async function () {
          info("Truncating storage.sqlite to 0 bytes");
          const file = getRelativeFile("storage.sqlite");
          const ostream = Cc[
            "@mozilla.org/network/file-output-stream;1"
          ].createInstance(Ci.nsIFileOutputStream);
          ostream.init(file, 0x02 | 0x20, 0o644, 0);
          ostream.close();
        },
        false
      );
    }
  );
}
