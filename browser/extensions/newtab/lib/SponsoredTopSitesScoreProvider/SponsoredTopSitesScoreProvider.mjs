/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  RemoteSettings: "resource://services-settings/remote-settings.sys.mjs",
  clearInterval: "resource://gre/modules/Timer.sys.mjs",
  setInterval: "resource://gre/modules/Timer.sys.mjs",
});

// How often scores are recomputed in milliseconds (24 hours).
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REMOTE_SETTINGS_COLLECTION = "newtab-sponsored-topsites-scoring";

// The prefix for flags to check when attempting to load the remote settings record.
const FLAG_PREFIX = "sponsored_top_site_scoring";

export class SponsoredTopSitesScoreProvider {
  /**
   * @param {Function} getFlags Returns the current adsBackend flags for selecting
   *  a configuration record through remote settings.
   */
  constructor(getFlags) {
    this._getFlags = getFlags;
    this._scores = {};
    this._refreshTimer = null;
    this._rs = null;
  }

  /**
   * Starts the scoring. This creates the Remote Settings client, schedules a
   * periodic refresh, and loads the first set of scores.
   *
   * @returns {Promise<void>} Resolves once the initial refresh completes.
   */
  async init() {
    if (!this._rs) {
      this._rs = lazy.RemoteSettings(REMOTE_SETTINGS_COLLECTION);
    }
    if (!this._refreshTimer) {
      this._refreshTimer = lazy.setInterval(
        () => this._refreshScores(),
        REFRESH_INTERVAL_MS
      );
    }
    await this._refreshScores();
  }

  /**
   * Stops the scoring. This cancels the refresh timer and clears any calculated
   * scores. Invoke this when scoring is disabled or the consumer is uninitializing.
   */
  uninit() {
    if (this._refreshTimer) {
      lazy.clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    this._rs = null;
    this._scores = {};
  }

  /**
   * Load any active config and update the cached scores. Resets the scores when
   * no config exists.
   *
   * @returns {Promise<void>} Resolves once the cached scores are updated.
   */
  async _refreshScores() {
    const config = await this._loadConfig();
    if (!config) {
      this._scores = {};
    }
  }

  /**
   * Load the Remote Settings record with the matching id of the enabled flag.
   *
   * @returns {Promise<?object>} The matching config record or null when not found.
   */
  async _loadConfig() {
    const recordId = this._getRecordId();
    if (!recordId) {
      return null;
    }

    const records = await this._rs?.get();
    return records?.find(r => r.id === recordId) ?? null;
  }

  /**
   * Gets the Remote Settings record id to load by checking for an
   * enabled flag with the matching prefix. At most one flag should be
   * enabled. Returns null if multiple matching flags are enabled.
   *
   * @returns {?string} The record id to load. null when no flag is
   * enabled or more than one enabled flag is found.
   */
  _getRecordId() {
    const flags = this._getFlags?.() ?? {};
    const enabled = Object.keys(flags).filter(
      flag => flag.startsWith(FLAG_PREFIX) && flags[flag]
    );
    return enabled.length === 1 ? enabled[0] : null;
  }

  /**
   * Get the currently calculated scores.
   *
   * @returns {object} A map of scores.
   */
  getScores() {
    return this._scores;
  }
}
