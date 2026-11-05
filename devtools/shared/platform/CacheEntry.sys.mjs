/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Parses a cache entry returned from the backend to build a response cache
 * object.
 *
 * @param {nsICacheEntry} cacheEntry
 *     The cache entry from the backend.
 *
 * @returns {object}
 *     A responseCache object expected by RDP.
 */
function buildResponseCacheObject(cacheEntry) {
  const cacheObject = {};
  try {
    if (cacheEntry.storageDataSize) {
      cacheObject.storageDataSize = cacheEntry.storageDataSize;
    }
  } catch (e) {
    // We just need to handle this in case it's a js file of 0B.
  }
  if (cacheEntry.expirationTime) {
    cacheObject.expirationTime = cacheEntry.expirationTime;
  }
  if (cacheEntry.fetchCount) {
    cacheObject.fetchCount = cacheEntry.fetchCount;
  }
  if (cacheEntry.lastFetched) {
    cacheObject.lastFetched = cacheEntry.lastFetched;
  }
  if (cacheEntry.lastModified) {
    cacheObject.lastModified = cacheEntry.lastModified;
  }
  if (cacheEntry.deviceID) {
    cacheObject.deviceID = cacheEntry.deviceID;
  }
  return cacheObject;
}

/**
 * Get the cache entry used by the channel and build a response cache object.
 * This must be called before the channel stops, as the channel releases its
 * cache entry at that point.
 *
 * @param {nsIChannel} channel
 *     The channel object.
 *
 * @returns {object | null}
 *     A response cache object, or null if the channel has no cache entry.
 */
export function getResponseCacheObject(channel) {
  let cacheEntry;
  try {
    cacheEntry = channel
      .QueryInterface(Ci.nsICachingChannel)
      .cacheToken.QueryInterface(Ci.nsICacheEntry);
  } catch (e) {
    return null;
  }
  return buildResponseCacheObject(cacheEntry);
}
