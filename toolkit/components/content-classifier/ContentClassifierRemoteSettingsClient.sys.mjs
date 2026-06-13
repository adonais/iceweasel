/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  RemoteSettings: "resource://services-settings/remote-settings.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    maxLogLevelPref:
      "privacy.trackingprotection.content.remote_settings.loglevel",
    prefix: "ContentClassifier",
  });
});

const COLLECTION_NAME = "content-classifier-lists";

/**
 * RemoteSettings client that fetches content classifier filter lists
 * and pushes them to the C++ ContentClassifierService.
 */
export class ContentClassifierRemoteSettingsClient {
  classID = Components.ID("{C7DDDBF2-8BC4-41A1-AC90-5144BEC5ABDF}");
  QueryInterface = ChromeUtils.generateQI([
    "nsIContentClassifierRemoteSettingsClient",
  ]);

  #rs = null;
  #onSyncCallback = null;
  #service = null;
  #initialized = false;

  constructor() {
    this.#rs = lazy.RemoteSettings(COLLECTION_NAME);
  }

  /**
   * Initialize the client, import all existing lists, and register a
   * sync listener for future updates. Resolves once the initial import
   * has finished (or failed). Safe to call more than once; subsequent
   * calls resolve immediately without re-importing.
   *
   * The service keeps a strong reference to this client via mRSClient
   * and we keep a strong reference back via #service. The resulting
   * cycle is broken explicitly when the service calls shutdown().
   *
   * @param {nsIContentClassifierService} service
   *   The C++ service to push filter list data to.
   */
  async init(service) {
    if (!service) {
      throw new Error("Missing required argument service");
    }
    if (this.#initialized) {
      lazy.log.debug(`init: already initialized`);
      return;
    }
    this.#initialized = true;
    this.#service = service;

    lazy.log.debug(`init: starting import`);
    // Register the sync listener before the async import so a sync event
    // that fires during the import is not lost.
    this.#onSyncCallback = this.onSync.bind(this);
    this.#rs.on("sync", this.#onSyncCallback);
    await this.importAllLists();
    lazy.log.debug(`init: done, sync listener registered`);
  }

  /**
   * Shut down the client and unregister the sync listener.
   */
  shutdown() {
    lazy.log.debug(`shutdown`);
    if (this.#onSyncCallback) {
      this.#rs.off("sync", this.#onSyncCallback);
      this.#onSyncCallback = null;
    }
    this.#service = null;
    this.#initialized = false;
  }

  /**
   * Handle a RemoteSettings sync event by applying record changes
   * to the content classifier service.
   *
   * @param {object} event
   * @param {object} event.data
   * @param {Array} event.data.created  Newly added records.
   * @param {Array} event.data.updated  Records with {old, new} pairs.
   * @param {Array} event.data.deleted  Removed records.
   */
  async onSync({ data: { created = [], updated = [], deleted = [] } }) {
    let service = this.#service;
    if (!service) {
      return;
    }

    lazy.log.debug(
      `onSync: ${created.length} created, ${updated.length} updated, ${deleted.length} deleted`
    );

    for (let record of deleted) {
      try {
        await this.#rs.attachments.deleteDownloaded(record);
      } catch (e) {
        lazy.log.error(`Failed to delete attachment for "${record.Name}":`, e);
      }
      service.removeFilterList(record.Name);
      lazy.log.info(`Removed list "${record.Name}"`);
    }

    let updateResults = await Promise.all(
      updated.map(async ({ new: newRecord }) => {
        // The attachment cache is keyed by record id, and old/new have
        // the same id for updated records, so download() overwrites the
        // stale cached attachment. No explicit deleteDownloaded needed.
        let ok = await this.#downloadAndStore(service, newRecord);
        if (ok) {
          lazy.log.info(`Updated list "${newRecord.Name}"`);
        }
        return ok;
      })
    );

    let createResults = await Promise.all(
      created.map(async record => {
        let ok = await this.#downloadAndStore(service, record);
        if (ok) {
          lazy.log.info(`Added list "${record.Name}"`);
        }
        return ok;
      })
    );

    // Always apply so that `deleted` takes effect even if all
    // downloads failed. For updates/creates, applyFilterLists will
    // simply rebuild from whatever stored data survived.
    service.applyFilterLists();

    let failureCount =
      updateResults.filter(ok => !ok).length +
      createResults.filter(ok => !ok).length;
    if (failureCount) {
      lazy.log.warn(`onSync: ${failureCount} record(s) failed to download`);
    }
  }

  /**
   * Fetch all records from the collection, download their attachments,
   * and push the data to the C++ service.
   */
  async importAllLists() {
    let service = this.#service;
    if (!service) {
      return;
    }

    try {
      let records = await this.#rs.get();
      lazy.log.debug(`importAllLists: got ${records.length} records`);

      if (records.length) {
        let results = await Promise.all(
          records.map(record => this.#downloadAndStore(service, record))
        );
        let failureCount = results.filter(ok => !ok).length;
        if (failureCount) {
          lazy.log.warn(
            `importAllLists: ${failureCount} record(s) failed to download`
          );
        }
      }
    } catch (error) {
      lazy.log.error(`Error importing lists:`, error);
    } finally {
      // Always apply, even on total failure, so callers waiting on the
      // "lists loaded" notification don't hang.
      service.applyFilterLists();
    }
  }

  /**
   * Download a record's attachment and push it to the service.
   *
   * @param {nsIContentClassifierService} service
   * @param {object} record  A RemoteSettings record with an attachment.
   * @returns {Promise<boolean>}
   *   true if the data was successfully stored, false otherwise.
   */
  async #downloadAndStore(service, record) {
    if (!record.attachment) {
      lazy.log.warn(`Record "${record.Name}" has no attachment`);
      return false;
    }

    try {
      let result = await this.#rs.attachments.download(record, {
        fallbackToCache: true,
        fallbackToDump: true,
      });
      let bytes = new Uint8Array(result.buffer);
      service.setFilterListData(record.Name, bytes);
      lazy.log.debug(
        `Downloaded and stored "${record.Name}" (${bytes.length} bytes)`
      );
      return true;
    } catch (e) {
      lazy.log.error(`Failed to download attachment for "${record.Name}":`, e);
      return false;
    }
  }
}
