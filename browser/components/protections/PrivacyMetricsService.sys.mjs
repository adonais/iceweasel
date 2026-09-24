/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "TrackingDBService",
  "@mozilla.org/tracking-db-service;1",
  Ci.nsITrackingDBService
);

export const privacyMetricsStatsCategories = {
  [Ci.nsITrackingDBService.TRACKERS_ID]: "trackers",
  [Ci.nsITrackingDBService.TRACKING_COOKIES_ID]: "cookies",
  [Ci.nsITrackingDBService.FINGERPRINTERS_ID]: "fingerprinters",
  [Ci.nsITrackingDBService.SUSPICIOUS_FINGERPRINTERS_ID]: "fingerprinters",
  [Ci.nsITrackingDBService.CRYPTOMINERS_ID]: "cryptominers",
  [Ci.nsITrackingDBService.SOCIAL_ID]: "socialTrackers",
};

/**
 * @typedef {object} PrivacyMetricsStats
 * @property {number} total - Total blocks this week
 * @property {number} trackers - Tracker count
 * @property {number} cookies - Tracking cookie count
 * @property {number} fingerprinters - Fingerprinter count
 * @property {number} cryptominers - Cryptominer count
 * @property {number} socialTrackers - Social tracker count
 * @property {number} lastUpdated - Timestamp in milliseconds
 */

/**
 * Service for collecting privacy metrics from TrackingDBService.
 * Provides weekly tracking protection statistics.
 */
export const PrivacyMetricsService = {
  /**
   * Get weekly tracking protection statistics.
   *
   * @returns {Promise<PrivacyMetricsStats>}
   */
  async getWeeklyStats() {
    /** @type {number} */
    const todayInMs = Date.now();
    /** @type {number} */
    const weekAgoInMs = todayInMs - 7 * 24 * 60 * 60 * 1000;

    const eventRows = await lazy.TrackingDBService.getEventsByDateRange(
      weekAgoInMs,
      todayInMs
    );

    return this._aggregateStats(eventRows);
  },

  /**
   * Get today's tracking protection statistics.
   *
   * TrackingDBService buckets events by UTC date and getEventsByDateRange
   * truncates both bounds to a date, so passing `now` for both selects just
   * today's row (matching how events are recorded).
   *
   * @returns {Promise<PrivacyMetricsStats>}
   */
  async getTodayStats() {
    /** @type {number} */
    const todayInMs = Date.now();

    const eventRows = await lazy.TrackingDBService.getEventsByDateRange(
      todayInMs,
      todayInMs
    );

    return this._aggregateStats(eventRows);
  },

  /**
   * Aggregate TrackingDBService data by category.
   *
   * @param {Array} eventRows - Array of database rows from TrackingDBService
   * @returns {PrivacyMetricsStats}
   */
  _aggregateStats(eventRows) {
    const counts = {};
    Object.values(privacyMetricsStatsCategories).forEach(category => {
      counts[category] = 0;
    });

    for (let row of eventRows) {
      const count = row.getResultByName("count");
      const type = row.getResultByName("type");

      const category = privacyMetricsStatsCategories[type];
      if (typeof category === "undefined") {
        continue;
      }
      counts[category] += count;
    }

    const total = Math.sumPrecise(Object.values(counts));

    return {
      total,
      ...counts,
      lastUpdated: Date.now(),
    };
  },
};
