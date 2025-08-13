/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  E10SUtils: "resource://gre/modules/E10SUtils.sys.mjs",
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

/**
 * Parent process JSActor for handling cache lookups for moz-cachged-ohttp
 * protocol. This actor handles cache operations that require parent process
 * privileges.
 */
export class MozCachedOHTTPParent extends JSProcessActorParent {
  receiveMessage(message) {
    if (
      this.manager.remoteType !== null &&
      this.manager.remoteType !== lazy.E10SUtils.PRIVILEGEDABOUT_REMOTE_TYPE
    ) {
      return Promise.reject(new Error("Process type mismatch"));
    }

    switch (message.name) {
      case "tryCache": {
        let uri = Services.io.newURI(message.data.uriString);
        return this.tryCache(uri);
      }
      case "writeCache": {
        let uri = Services.io.newURI(message.data.uriString);
        return this.writeCache(
          uri,
          message.data.cacheInputStream,
          message.data.cacheStreamUpdatePort
        );
      }
    }

    return Promise.reject(new Error(`Unknown message: ${message.name}`));
  }

  /**
   * Attempts to load the resource from the HTTP cache without making network
   * requests. On cache miss, provides an output stream for writing to cache.
   *
   * @param {nsIURI} resourceURI
   *   The URI of the resource to load from cache
   * @returns {Promise<object>}
   *   Promise that resolves to result object with success flag and data
   */
  async tryCache(resourceURI) {
    try {
      const cacheEntry = await this.#openCacheEntry(
        resourceURI,
        Ci.nsICacheStorage.OPEN_READONLY
      );

      if (!cacheEntry.dataSize) {
        throw new Error("Cache entry is empty.");
      }

      // Cache hit - return input stream for reading
      const inputStream = cacheEntry.openInputStream(0);

      return {
        success: true,
        inputStream,
      };
    } catch (e) {
      // Cache miss or error - proceed without caching
      return { success: false };
    }
  }

  /**
   * Writes resource data to the HTTP cache. Opens a cache entry for the
   * specified URI and copies data from the input stream to the cache, handling
   * cache control messages for expiration and entry management.
   *
   * @param {nsIURI} resourceURI
   *   The URI of the resource to cache
   * @param {nsIInputStream} cacheInputStream
   *   Input stream containing the resource data to cache
   * @param {MessageChannelPort} cacheStreamUpdatePort
   *   MessagePort for receiving cache control messages:
   *   - "DoomCacheEntry": Remove cache entry (on error/no-cache)
   *   - "WriteCacheExpiry": Set cache expiration time
   * @returns {Promise<undefined>}
   *   Promise that resolves when caching is complete
   */
  async writeCache(resourceURI, cacheInputStream, cacheStreamUpdatePort) {
    let cacheEntry;
    let outputStream;

    try {
      cacheEntry = await this.#openCacheEntry(
        resourceURI,
        Ci.nsICacheStorage.OPEN_NORMALLY
      );
      outputStream = cacheEntry.openOutputStream(0, -1);
    } catch (e) {
      return;
    }

    cacheStreamUpdatePort.onmessage = msg => {
      switch (msg.data.name) {
        case "DoomCacheEntry": {
          cacheEntry.asyncDoom(null);
          break;
        }
        case "WriteCacheExpiry": {
          cacheEntry.setExpirationTime(msg.data.expiry);
          break;
        }
      }
    };
    try {
      await new Promise(resolve => {
        lazy.NetUtil.asyncCopy(cacheInputStream, outputStream, writeResult => {
          if (!Components.isSuccessCode(writeResult)) {
            console.error(
              "Failed to cache moz-cached-ohttp resource with result: ",
              writeResult
            );
          }

          resolve();
        });
      });
    } finally {
      cacheStreamUpdatePort.onmessage = null;
    }
  }

  /**
   * Opens a cache entry for the specified URI.
   *
   * @param {nsIURI} uri
   *   The URI to open cache entry for.
   * @param {number} openFlags
   *   Cache storage open flags.
   * @returns {Promise<nsICacheEntry|null>}
   *   Promise that resolves to cache entry or null if not available.
   */
  async #openCacheEntry(uri, openFlags) {
    const lci = Services.loadContextInfo.anonymous;
    const storage = Services.cache2.diskCacheStorage(lci);

    // For read-only access, check existence first
    if (
      openFlags === Ci.nsICacheStorage.OPEN_READONLY &&
      !storage.exists(uri, "")
    ) {
      throw new Error("Cache entry does not exist.");
    }

    return new Promise((resolve, reject) => {
      storage.asyncOpenURI(uri, "", openFlags, {
        onCacheEntryCheck: () => Ci.nsICacheEntryOpenCallback.ENTRY_WANTED,
        onCacheEntryAvailable: (entry, _isNew, status) => {
          if (Components.isSuccessCode(status)) {
            resolve(entry);
          } else {
            reject(new Error(`Cache entry operation failed: ${status}`));
          }
        },
      });
    });
  }
}
