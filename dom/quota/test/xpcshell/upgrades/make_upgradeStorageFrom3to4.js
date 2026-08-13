/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

/**
 * Recorder script for the schema 3→4 quota manager migration test.
 *
 * Run this against a Firefox built from main (kCacheVersion = 3):
 *   ./mach xpcshell-test \
 *     dom/quota/test/xpcshell/upgrades/make_upgradeStorageFrom3to4.js \
 *     --interactive
 *
 * The script creates two origins populated with IDB, localStorage, Cache API,
 * and OPFS data, persists one of them, resets the quota manager to flush all
 * state to disk, and then packages everything into a zip archive written to
 * the source tree alongside this file.
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

function enumerateTree(entryList, dir, dirPath) {
  entryList.push({ path: dirPath, file: dir });

  const entries = dir.directoryEntries;
  let nextFile;
  while ((nextFile = entries.nextFile)) {
    const childPath = `${dirPath}/${nextFile.leafName}`;
    if (nextFile.isDirectory()) {
      enumerateTree(entryList, nextFile, childPath);
    } else {
      entryList.push({ path: childPath, file: nextFile });
    }
  }
}

// nsIZipWriter uses PRTime (microseconds). 1980-01-01 is the minimum ZIP date.
const kMinZipPRTime = 315532800 * 1000 * 1000;

function zipProfile(zipFile, profileDir) {
  const zipWriter = Cc["@mozilla.org/zipwriter;1"].createInstance(
    Ci.nsIZipWriter
  );
  zipWriter.open(zipFile, 0x04 | 0x08 | 0x20);

  const entryList = [];

  const storageDir = profileDir.clone();
  storageDir.append("storage");

  const defaultDir = storageDir.clone();
  defaultDir.append("default");

  entryList.push({ path: "storage", file: storageDir });
  entryList.push({ path: "storage/default", file: defaultDir });

  for (const origin of ["https+++www.example.org", "https+++www.example.com"]) {
    const originDir = defaultDir.clone();
    originDir.append(origin);
    if (originDir.exists()) {
      enumerateTree(entryList, originDir, `storage/default/${origin}`);
    }
  }

  const permanentDir = storageDir.clone();
  permanentDir.append("permanent");
  if (permanentDir.exists()) {
    entryList.push({ path: "storage/permanent", file: permanentDir });
    const chromeDir = permanentDir.clone();
    chromeDir.append("chrome");
    if (chromeDir.exists()) {
      enumerateTree(entryList, chromeDir, "storage/permanent/chrome");
    }
  }

  const storageSqliteFile = profileDir.clone();
  storageSqliteFile.append("storage.sqlite");
  if (storageSqliteFile.exists()) {
    entryList.push({ path: "storage.sqlite", file: storageSqliteFile });
  }

  for (const { path, file } of entryList) {
    if (path.endsWith("-wal") || path.endsWith("-shm")) {
      continue;
    }
    const timestamp = Math.max(file.lastModifiedTime * 1000, kMinZipPRTime);
    if (file.isDirectory()) {
      zipWriter.addEntryDirectory(path, timestamp, false);
    } else {
      const istream = Cc[
        "@mozilla.org/network/file-input-stream;1"
      ].createInstance(Ci.nsIFileInputStream);
      istream.init(file, -1, -1, 0);
      zipWriter.addEntryStream(
        path,
        timestamp,
        Ci.nsIZipWriter.COMPRESSION_DEFAULT,
        istream,
        false
      );
      istream.close();
    }
  }

  zipWriter.close();
}

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
    `(async function() { ${scriptSource} })().then(resolve, reject);`,
    sandbox
  );

  return promise;
}

async function populateOrigin(principal, originLabel) {
  // IndexedDB: create object store "store1" with one record keyed "seed"
  {
    const request = indexedDB.openForPrincipal(principal, "db1", 1);
    await openDBRequestUpgradeNeeded(request);
    const db = request.result;
    const store = db.createObjectStore("store1");
    store.put(`${originLabel}-idb`, "seed");
    await IndexedDBUtils.requestFinished(request);
    db.close();
  }

  // The system principal has no URI so localStorage, Cache API, and OPFS are
  // not meaningful for it; skip them and rely on IDB alone for that origin.
  if (principal.isSystemPrincipal) {
    return;
  }

  // localStorage: set key1
  {
    const storage = LocalStorageUtils.createStorage(principal);
    storage.setItem("key1", `${originLabel}-ls`);
    storage.close();
  }

  // Cache API: store a response for https://example/seed in cache "c1"
  {
    const seedValue = JSON.stringify(`${originLabel}-cache`);
    await sandboxOp(
      principal,
      ["caches", "fetch"],
      {},
      `
      const cache = await caches.open("c1");
      await cache.put(
        new Request("https://example/seed"),
        new Response(${seedValue})
      );
    `
    );
  }

  // OPFS: write seed.txt
  {
    const seedValue = JSON.stringify(`${originLabel}-opfs`);
    await sandboxOp(
      principal,
      ["storage"],
      { forceSecureContext: true },
      `
      const root = await storage.getDirectory();
      const fh = await root.getFileHandle("seed.txt", { create: true });
      const w = await fh.createWritable();
      await w.write(${seedValue});
      await w.close();
    `
    );
  }
}

async function makeProfile() {
  info("Populating https://www.example.org (temporary)");

  const orgPrincipal = PrincipalUtils.createPrincipal(
    "https://www.example.org"
  );
  await populateOrigin(orgPrincipal, "example.org");

  info("Populating https://www.example.com (to be persisted)");

  const comPrincipal = PrincipalUtils.createPrincipal(
    "https://www.example.com"
  );
  await populateOrigin(comPrincipal, "example.com");

  info("Persisting https://www.example.com");

  {
    const request = Services.qms.persist(comPrincipal);
    await QuotaUtils.requestFinished(request);
  }

  info("Populating chrome (system principal, lands in storage/permanent/)");

  const chromePrincipal = Services.scriptSecurityManager.getSystemPrincipal();
  await populateOrigin(chromePrincipal, "chrome");

  info("Resetting quota manager to flush state to disk");

  {
    const request = Services.qms.reset();
    await QuotaUtils.requestFinished(request);
  }

  const profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
  const currentDir = Services.dirsvc.get("CurWorkD", Ci.nsIFile);

  const zipFile = currentDir.clone();
  zipFile.append("upgradeStorageFrom3to4_profile.zip");
  if (zipFile.exists()) {
    zipFile.remove(false);
  }

  info("Writing zip archive");

  zipProfile(zipFile, profileDir);

  info(`ZIP written to: ${zipFile.path}`);
}

async function testSteps() {
  add_task(
    {
      pref_set: [
        ["dom.storage.testing", true],
        ["dom.storage.client_validation", false],
      ],
    },
    makeProfile
  );
}
