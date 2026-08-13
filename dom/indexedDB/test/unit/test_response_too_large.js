/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

/* exported testGenerator, disableWorkerTest */
var disableWorkerTest = "Need a way to set temporary prefs from a worker";

var testGenerator = testSteps();

function* testSteps() {
  const name = this.window
    ? window.location.pathname
    : "test_response_too_large.js";
  const megaBytes = 1024 * 1024;
  // kMaxIDBMsgOverhead in ActorsParent.cpp is 10 MB, so with this pref set to
  // 20 MB, kMaxMessageSize = 10 MB.
  const kMaxIpcMessageSize = 20;

  if (this.window) {
    SpecialPowers.pushPrefEnv(
      {
        set: [
          [
            "dom.indexedDB.maxSerializedMsgSize",
            kMaxIpcMessageSize * megaBytes,
          ],
        ],
      },
      continueToNextStep
    );
    yield undefined;
  } else {
    setMaxSerializedMsgSize(kMaxIpcMessageSize * megaBytes);
  }

  let openRequest = indexedDB.open(name, 1);
  openRequest.onerror = errorHandler;
  openRequest.onupgradeneeded = grabEventAndContinueHandler;
  openRequest.onsuccess = unexpectedSuccessHandler;
  let event = yield undefined;

  let db = event.target.result;

  is(db.objectStoreNames.length, 0, "Correct objectStoreNames list");

  let objectStore = db.createObjectStore("store");
  is(db.objectStoreNames.length, 1, "Correct objectStoreNames list");
  is(
    db.objectStoreNames.item(0),
    objectStore.name,
    "Correct object store name"
  );

  openRequest.onsuccess = grabEventAndContinueHandler;
  event = yield undefined;
  db = event.target.result;

  // Each 57 KB ArrayBuffer has a structured clone serialized size just below
  // IPC::kMessageBufferShmemThreshold (64 KB). Values at or below that threshold
  // are counted in full towards the IPC message size estimate, whereas larger
  // values contribute only a fixed 16-byte handle. 200 records × ~57 KB ≈
  // 11.4 MB, which exceeds kMaxMessageSize (10 MB), so getAll() must fail.
  const recordSize = 57 * 1024;
  const recordCount = 200;

  let tx = db.transaction("store", "readwrite");
  let store = tx.objectStore("store");
  for (let i = 0; i < recordCount; i++) {
    store.put(new ArrayBuffer(recordSize), i);
  }
  tx.oncomplete = continueToNextStep;
  tx.onerror = errorHandler;
  yield undefined;

  info(
    "Verifying that getAll() fails with UnknownError and a descriptive message"
  );

  let request = db.transaction("store").objectStore("store").getAll();
  request.onsuccess = unexpectedSuccessHandler;
  request.onerror = grabEventAndContinueHandler;
  event = yield undefined;

  ok(event.target.error instanceof DOMException, "got a DOM exception");
  is(event.target.error.name, "UnknownError", "correct error");
  ok(
    event.target.error.message.startsWith("The serialized value is too large"),
    "message: " + event.target.error.message
  );
  event.preventDefault();

  db.close();

  finishTest();
}
