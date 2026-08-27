/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AsyncShutdown: "resource://gre/modules/AsyncShutdown.sys.mjs",
  Store:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
});

// File name of the Application Services `autofill` SQLite store within the
// profile directory. It is the sibling of the JSON profile that backs
// addresses/credit cards (autofill-profiles.json).
const AUTOFILL_STORE_FILE_NAME = "autofill.db";

/**
 * Owns the lifecycle of the Application Services `autofill` SQLite store.
 *
 * There is one store per profile -- addresses, credit cards and passports are
 * collections within it -- so this is a singleton and the store itself is
 * opened lazily on first use. On first open it registers a shutdown blocker
 * that closes the store's rusqlite connection; otherwise the connection is
 * only closed when its JS wrapper is garbage-collected, which happens too late
 * in shutdown.
 */
export class RustAutofillStore {
  static _instance = null;

  _storePromise = null;

  // A second handler would open a second connection to the same file and
  // register a second shutdown blocker, so constructing always hands back the
  // shared instance.
  constructor() {
    if (RustAutofillStore._instance) {
      return RustAutofillStore._instance;
    }
    RustAutofillStore._instance = this;
  }

  /**
   * Lazily open the store, registering the shutdown blocker on first open.
   *
   * @returns {Promise<Store>}
   */
  async ensureOpen() {
    if (!this._storePromise) {
      // Hold the promise rather than the opened store, so that callers racing
      // to open share one connection instead of each starting their own.
      this._storePromise = lazy.Store.init(
        PathUtils.join(PathUtils.profileDir, AUTOFILL_STORE_FILE_NAME)
      );
      await this._registerShutdownBlocker();
    }
    return this._storePromise;
  }

  /**
   * Close the store's database connection. After this, store operations reject
   * with a DatabaseClosed error. A no-op if the store was never opened, and
   * tolerant of a store that failed to open.
   */
  async finalize() {
    if (!this._storePromise) {
      return;
    }
    let store;
    try {
      store = await this._storePromise;
    } catch {
      // The store never opened, so there is no connection to close.
      return;
    }
    await store.shutdown();
  }

  /**
   * Register a profile-teardown blocker that closes the store. If the teardown
   * phase has already passed by the time the store is opened, registering a
   * blocker would throw, so close it as soon as it is open instead.
   *
   * @param {object} phase An `AsyncShutdown` phase object. Exposed as a
   *   parameter for testing.
   */
  async _registerShutdownBlocker(
    phase = lazy.AsyncShutdown.profileChangeTeardown
  ) {
    if (phase.isClosed) {
      await this.finalize();
      return;
    }
    phase.addBlocker(
      "RustAutofillStore: Close the Application Services autofill store",
      () => this.finalize()
    );
  }
}
