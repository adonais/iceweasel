/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  NewTabUtils: "resource://gre/modules/NewTabUtils.sys.mjs",
  RemoteSettings: "resource://services-settings/remote-settings.sys.mjs",
  clearInterval: "resource://gre/modules/Timer.sys.mjs",
  setInterval: "resource://gre/modules/Timer.sys.mjs",
});

// Microseconds per day to match on visit_date
const US_PER_DAY = 24 * 60 * 60 * 1000 * 1000;

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
      return;
    }

    // TODO: get counts from _getDomainDayCounts and compute scores with differential privacy.
    this._scores = {};
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

  /**
   * Sum visits to the configured target domains by domain and day.
   *
   * @param {object} config The active Remote Settings config.
   * @returns {Promise<Map<string, Map<number, number>>>} The visit count per
   *  configured domain, keyed by day, in the lookback window.
   */
  async _getDomainDayCounts(config) {
    const prefixMap = this._revHostPrefixMap(config);
    if (!prefixMap.size) {
      return new Map();
    }

    const todayDay = Math.floor((Date.now() * 1000) / US_PER_DAY);
    const sinceDay = todayDay - (config.lookback_days - 1);
    const query = `
      SELECT
        p.rev_host AS rev_host,
        CAST(v.visit_date / ${US_PER_DAY} AS INTEGER) AS day,
        COUNT(*) AS visits
      FROM moz_historyvisits v
      JOIN moz_places p ON p.id = v.place_id
      WHERE v.visit_date >= :since_date
        AND v.visit_type IN
        (${lazy.PlacesUtils.history.TRANSITIONS.LINK},
         ${lazy.PlacesUtils.history.TRANSITIONS.TYPED},
         ${lazy.PlacesUtils.history.TRANSITIONS.BOOKMARK})
      GROUP BY p.rev_host, day
    `;

    const rows =
      await lazy.NewTabUtils.activityStreamProvider.executePlacesQuery(query, {
        columns: ["rev_host", "day", "visits"],
        params: { since_date: sinceDay * US_PER_DAY },
      });

    // Filter domains and sum by day.
    const domainDayCounts = new Map();
    for (const row of rows) {
      const domain = this._findConfiguredDomain(row.rev_host, prefixMap);
      if (!domain) {
        continue;
      }

      const days = domainDayCounts.get(domain) ?? new Map();
      days.set(row.day, (days.get(row.day) ?? 0) + row.visits);
      domainDayCounts.set(domain, days);
    }

    return domainDayCounts;
  }

  /**
   * Build a map of rev_host prefix to configured domain.
   *
   * @param {object} config The active Remote Settings config.
   * @returns {Map<string, string>} Reversed host prefix to domain, e.g.
   *  "moc.elpmaxe." to "example.com".
   */
  _revHostPrefixMap(config) {
    const prefixMap = new Map();
    for (const domains of Object.values(config.targets ?? {})) {
      for (const domain of domains ?? []) {
        const loweredDomain = domain.toLowerCase();
        prefixMap.set(
          lazy.PlacesUtils.getReversedHost(new URL(`http://${loweredDomain}`)),
          loweredDomain
        );
      }
    }
    return prefixMap;
  }

  /**
   * Lookup a rev_host against the configured domains by checking each label
   * boundary. The most specific configured domain wins if multiple match.
   *
   * @param {?string} revHost The rev_host from moz_places, which is nullable.
   * @param {Map<string, string>} prefixMap rev_host prefix to domain.
   * @returns {?string} The matched domain, or null when none matches.
   */
  _findConfiguredDomain(revHost, prefixMap) {
    // Trim the empty last element due to the trailing dot in rev_host
    const labels = revHost?.split(".").slice(0, -1) ?? [];
    let prefix = "";
    let match = null;
    for (const label of labels) {
      prefix += `${label}.`;
      match = prefixMap.get(prefix) ?? match;
    }
    return match;
  }
}
