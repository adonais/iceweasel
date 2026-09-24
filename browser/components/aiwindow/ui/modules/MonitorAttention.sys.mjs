/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Used as storage mechanism: a JSON array of { id, at } for the matches behind the dot,
// newest match first and one entry per monitor.
const PREF_MATCHES = "browser.smartwindow.agent.monitorAttention";

// 7 days in milliseconds.
export const MONITOR_ATTENTION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Which monitors have matched their condition since the user last opened the
 * panel, and which of those are still recent enough to be worth saying. This is
 * one half of what puts the dot on the monitor toolbar button; announcing the
 * feature as new is the other, and lives with the button itself.
 *
 * This owns the pref and nothing else. It has no notion of a window, so
 * repainting the button after a change is the caller's job.
 *
 * @typedef {{id: string, at: number}} MonitorMatch
 *   A monitor id and the epoch milliseconds at which it matched.
 */
export const MonitorAttention = {
  /**
   * The monitors worth drawing attention to, dropping matches the user never
   * came back for so a stale one stops being advertised.
   *
   * @returns {string[]} Monitor ids, newest match first.
   */
  get matchedIds() {
    return this.unexpiredIds(this._read());
  },

  /**
   * @returns {boolean} Whether any monitor has matched since the user last
   * opened the panel.
   */
  get hasMatches() {
    return !!this.matchedIds.length;
  },

  /**
   * @param {string} monitorId - The monitor whose run met its condition.
   */
  recordMatch(monitorId) {
    if (!monitorId) {
      return;
    }
    Services.prefs.setStringPref(
      PREF_MATCHES,
      JSON.stringify(this.withMatch(this._read(), monitorId))
    );
  },

  clearMatches() {
    Services.prefs.clearUserPref(PREF_MATCHES);
  },

  /**
   * Reads stored matches. Anything unrecognized reads as no matches rather
   * than throwing, so a corrupt value cannot take the toolbar button down with
   * it, and one bad entry does not discard the good ones around it.
   *
   * @param {string} stored - The stored JSON, or [] when nothing is stored.
   * @returns {MonitorMatch[]} Matches newest first, as stored.
   */
  parseMatches(stored) {
    if (!stored) {
      return [];
    }
    let parsed;
    try {
      parsed = JSON.parse(stored);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(match => match?.id && typeof match.at == "number");
  },

  /**
   * @param {MonitorMatch[]} matches
   * @param {number} [now] - Epoch milliseconds to measure the lifetime against.
   * @returns {string[]} Monitor ids, newest match first.
   */
  unexpiredIds(matches, now = Date.now()) {
    const cutoff = now - MONITOR_ATTENTION_LIFETIME_MS;
    return matches.filter(match => match.at > cutoff).map(match => match.id);
  },

  /**
   * Records a match, keeping one entry per monitor. The order is stored rather
   * than recovered by comparing timestamps afterwards, because two monitors
   * can match in the same millisecond and then cannot be told apart.
   *
   * @param {MonitorMatch[]} matches
   * @param {string} monitorId - The monitor whose run met its condition.
   * @param {number} [now] - Epoch milliseconds of the match.
   * @returns {MonitorMatch[]} Matches newest first, with this one at the front.
   */
  withMatch(matches, monitorId, now = Date.now()) {
    const rest = matches.filter(match => match.id !== monitorId);
    return [{ id: monitorId, at: now }, ...rest];
  },

  /**
   * @returns {MonitorMatch[]} Matches newest first, as stored.
   */
  _read() {
    return this.parseMatches(Services.prefs.getStringPref(PREF_MATCHES, ""));
  },
};
