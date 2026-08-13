/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PrivacyMetricsService:
    "moz-src:///browser/components/protections/PrivacyMetricsService.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

import {
  actionTypes as at,
  actionCreators as ac,
} from "resource://newtab/common/Actions.mjs";
import {
  WIDGET_REGISTRY,
  isWidgetEnabled,
} from "resource://newtab/common/WidgetsRegistry.mjs";

const PREF_WIDGETS_ENABLED = "widgets.enabled";

const PRIVACY_ENTRY = WIDGET_REGISTRY.find(w => w.id === "privacy");

// Prefs that can flip the widget's registry enablement (incl. trainhop config).
// A change to any of these should re-evaluate whether to start fetching.
const ENABLEMENT_PREFS = new Set([
  PREF_WIDGETS_ENABLED,
  PRIVACY_ENTRY.enabledPref,
  PRIVACY_ENTRY.systemEnabledPref,
  "trainhopConfig",
]);

/**
 * Feed for the Privacy widget. Runs in the parent process and reads the daily
 * tracker-blocked count straight from PrivacyMetricsService (same process, so
 * no IPC), broadcasting it to the Redux store on startup and each SYSTEM_TICK.
 */
export class PrivacyFeed {
  get enabled() {
    const prefs = this.store.getState()?.Prefs.values;
    // Share the registry enablement logic the UI uses so trainhop rollouts
    // (trainhopConfig.widgets.privacyEnabled) start the feed even when the
    // system pref defaults false. Otherwise the widget renders but the counter
    // stays stuck at the empty state.
    return isWidgetEnabled(PRIVACY_ENTRY, prefs, prefs?.[PREF_WIDGETS_ENABLED]);
  }

  /**
   * Count of distinct sites visited today, read from the Places history DB.
   *
   * NOTE: this is "sites visited today", not "sites where a tracker was
   * blocked" — the tracking DB records no per-site data, so this is a proxy
   * (see Bug 2048384 discussion). Private-browsing visits are not recorded in
   * Places, so they're inherently excluded.
   *
   * @returns {Promise<number>}
   */
  async getSitesVisitedToday() {
    const db = await lazy.PlacesUtils.promiseDBConnection();
    // Count non-hidden pages only — hidden = 1 covers redirect sources, embeds,
    // and framed visits, so e.g. amazon.com -> www.amazon.com counts as one
    // site, not two.
    //
    // Day boundary is UTC midnight to match the tracker count, which keys on
    // TrackingDBService's UTC date and so can't be local. RISK: both "today"
    // readouts therefore reset at UTC midnight — mid-day for users far from GMT.
    // Inherent to the tracking DB (about:protections behaves the same); a true
    // local-day "today" would need event-level timestamps in TrackingDBService.
    const rows = await db.execute(
      `SELECT COUNT(DISTINCT p.origin_id) AS count
       FROM moz_historyvisits v
       JOIN moz_places p ON v.place_id = p.id
       WHERE p.hidden = 0
       AND v.visit_date >= (strftime('%s','now','start of day') * 1000000)`
    );
    return rows[0]?.getResultByName("count") ?? 0;
  }

  async updateStats() {
    // @backward-compat { version 145 }
    // getTodayStats() ships alongside this widget; older platforms have
    // PrivacyMetricsService (Bug 2010368) without it. Guard until that
    // version reaches release, then remove this check.
    if (typeof lazy.PrivacyMetricsService?.getTodayStats !== "function") {
      return;
    }

    const [stats, sitesToday] = await Promise.all([
      lazy.PrivacyMetricsService.getTodayStats(),
      this.getSitesVisitedToday(),
    ]);
    this.store.dispatch(
      ac.BroadcastToContent({
        type: at.WIDGETS_PRIVACY_UPDATE,
        data: {
          // The headline count is the total blocked across all categories
          // (cookies, trackers, fingerprinters, cryptominers, social) — the
          // same total about:protections shows — not just the "trackers" slice.
          trackersToday: stats.total,
          sitesToday,
          lastUpdated: stats.lastUpdated,
        },
      })
    );
  }

  async onAction(action) {
    switch (action.type) {
      // INIT/SYSTEM_TICK keep the count fresh across the session; NEW_TAB_INIT
      // refreshes it each time a tab is opened so the count is current whenever
      // the user looks at it (the daily total changes as they browse).
      case at.INIT:
      case at.SYSTEM_TICK:
      case at.NEW_TAB_INIT:
        if (this.enabled) {
          await this.updateStats();
        }
        break;
      case at.PREF_CHANGED:
        // Enablement can flip on after startup (e.g. a trainhop rollout lands
        // its config); fetch as soon as it does.
        if (ENABLEMENT_PREFS.has(action.data?.name) && this.enabled) {
          await this.updateStats();
        }
        break;
    }
  }
}
