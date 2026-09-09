/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

/* exported testSteps */

// Test that corrupted/missing external files produce a NotReadableError as
// specified in
// https://w3c.github.io/IndexedDB/#retrieve-a-value-from-an-object-store
// step 3.

const name = "test_external_file_corruption.js";
const objectStoreName = "store";
const dataSize = 100000;
const dataThreshold = 4096;

async function storeLargeData() {
  info("Setting data threshold to force external file storage");
  setDataThreshold(dataThreshold);

  info("Opening database and storing large data");
  {
    const request = indexedDB.open(name);
    const event = await expectingUpgrade(request);
    event.target.result.createObjectStore(objectStoreName);
    const db = (await expectingSuccess(request)).target.result;

    const view = getView(dataSize);
    for (let i = 0; i < dataSize; i++) {
      view[i] = i % 251;
    }

    const tx = db.transaction(objectStoreName, "readwrite");
    tx.objectStore(objectStoreName).put(view, "key");
    await new Promise(resolve => {
      tx.oncomplete = resolve;
    });

    db.close();
  }

  info("Verifying external file was created");
  const filesDir = getChromeFilesDir();
  let externalFile = null;
  let entries = filesDir.directoryEntries;
  while (entries.hasMoreElements()) {
    let entry = entries.nextFile;
    if (entry.isFile()) {
      externalFile = entry;
      break;
    }
  }
  ok(externalFile, "External file exists");
  ok(externalFile.fileSize > 0, "External file is not empty");

  info("Resetting database to release connection");
  await new Promise(resolve => {
    resetAllDatabases(resolve);
  });

  return externalFile;
}

async function corruptFile(externalFile) {
  const path = externalFile.path;
  info("Corrupting external file: " + path);
  const sizeBefore = (await IOUtils.stat(path)).size;
  info("Size before corruption: " + sizeBefore);
  const data = new TextEncoder().encode("corrupt");
  const bytesWritten = await IOUtils.write(path, data);
  info("Bytes written: " + bytesWritten);
  const sizeAfter = (await IOUtils.stat(path)).size;
  info("Size after corruption: " + sizeAfter);
  ok(sizeAfter < 100, "External file was truncated");
}

async function readBack() {
  info("Reopening database and reading corrupted data");
  {
    const request = indexedDB.open(name);
    const db = (await expectingSuccess(request)).target.result;

    const tx = db.transaction(objectStoreName, "readonly");
    const getRequest = tx.objectStore(objectStoreName).get("key");

    await new Promise(resolve => {
      getRequest.onsuccess = () => {
        ok(false, "Read should have failed due to corruption");
        resolve();
      };
      getRequest.onerror = event => {
        event.preventDefault();
        is(
          event.target.error.name,
          "NotReadableError",
          "Should get NotReadableError for corrupted/deleted external file"
        );
        resolve();
      };
    });

    db.close();
  }
}

async function cleanup() {
  info("Cleaning up");
  resetDataThreshold();
  {
    const request = indexedDB.deleteDatabase(name);
    await new Promise(resolve => {
      request.onsuccess = resolve;
      request.onerror = resolve;
    });
  }
}

async function testFileCorrupted() {
  let externalFile = await storeLargeData();
  await corruptFile(externalFile);
  await readBack();
  await cleanup();
}

async function testFileDeleted() {
  let externalFile = await storeLargeData();
  info("Deleting external file: " + externalFile.path);
  await IOUtils.remove(externalFile.path, { ignoreAbsent: false });
  ok(!externalFile.exists(), "External file was deleted");
  await readBack();
  await cleanup();
}

async function testSteps() {
  add_task(testFileCorrupted);
  add_task(testFileDeleted);
}
