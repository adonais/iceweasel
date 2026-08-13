/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the LoginManager module.
 */

"use strict";

// Rust storage uses the rust sync bridge, which tracks sync status on its own.
const isRustBackend = Services.prefs.getBoolPref(
  "signon.storage.rust.enabled",
  false
);

const { LoginManager } = ChromeUtils.importESModule(
  "resource://gre/modules/LoginManager.sys.mjs"
);

add_task(async function test_ensureCurrentSyncID() {
  let loginManager = new LoginManager();
  await loginManager.setSyncID(1);
  await loginManager.setLastSync(100);

  // test calling ensureCurrentSyncID with the current sync ID
  Assert.equal(await loginManager.ensureCurrentSyncID(1), 1);
  Assert.equal(await loginManager.getSyncID(), 1, "sync ID shouldn't change");
  Assert.equal(
    await loginManager.getLastSync(),
    100,
    "last sync shouldn't change"
  );

  // test calling ensureCurrentSyncID with the different sync ID
  Assert.equal(await loginManager.ensureCurrentSyncID(2), 2);
  Assert.equal(await loginManager.getSyncID(), 2, "sync ID should be updated");
  Assert.equal(
    await loginManager.getLastSync(),
    0,
    "last sync should be reset"
  );
}).skip(isRustBackend);

// Regression test for bug 2056155. Since LoginManagerStorage.create() is
// asynchronous, _storage stays null between construction and the resolution of
// initializationPromise. The synchronous uiBusy/isLoggedIn getters must
// tolerate that window instead of throwing (which previously left HTTP auth
// prompts stuck open).
add_task(async function test_sync_getters_before_storage_init() {
  let loginManager = new LoginManager();
  Assert.strictEqual(
    loginManager._storage,
    null,
    "Storage is not initialized synchronously after construction"
  );
  Assert.strictEqual(
    loginManager.uiBusy,
    false,
    "uiBusy returns false before storage is initialized"
  );
  Assert.strictEqual(
    loginManager.isLoggedIn,
    false,
    "isLoggedIn returns false before storage is initialized"
  );

  await loginManager.initializationPromise;
  Assert.strictEqual(
    loginManager.uiBusy,
    false,
    "uiBusy still returns false once storage is initialized and idle"
  );
});
