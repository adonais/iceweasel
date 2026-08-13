/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { LoginManagerStorage_json } from "resource://gre/modules/storage-json.sys.mjs";
import { LoginManagerRustStorage } from "resource://gre/modules/storage-rust.sys.mjs";
import { LoginStorageMigrator } from "resource://gre/modules/LoginStorageMigrator.sys.mjs";

export class LoginManagerStorage extends LoginManagerStorage_json {
  static #jsonStorage = null;
  static #rustStorage = null;
  static #activeStore = null;
  static #initializationPromise = null;

  static create() {
    if (!this.#initializationPromise) {
      this.#jsonStorage = new LoginManagerStorage_json();
      this.#rustStorage = new LoginManagerRustStorage();

      this.#initializationPromise = this.#jsonStorage
        .initialize()
        .then(() => this.#rustStorage.initialize())
        .then(async () => {
          const store = await new LoginStorageMigrator(
            this.#jsonStorage,
            this.#rustStorage
          ).run();
          this.#activeStore = store;
          this.#jsonStorage.isActive = store === this.#jsonStorage;
          this.#rustStorage.isActive = store === this.#rustStorage;
          return store;
        });
    }

    return this.#initializationPromise;
  }

  static getActiveStore() {
    return this.#activeStore;
  }
}
