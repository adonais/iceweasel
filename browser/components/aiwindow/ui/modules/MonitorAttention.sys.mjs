/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Used as storage mechanism: a JSON array of { id, at, kind } for the runs
// behind the dot, newest run first and one entry per monitor.
const PREF_ATTENTION = "browser.smartwindow.agent.monitorAttention";

// 7 days in milliseconds.
export const MONITOR_ATTENTION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Why a monitor is asking for attention. Entries written before the dot
 * covered failures carry no kind and read as matches.
 */
export const ATTENTION_KINDS = Object.freeze({
  MATCH: "match",
  ERROR: "error",
});

/**
 * Which monitors have something to say since the user last opened the panel -
 * they matched their condition, or they could not check at all - and which of
 * those are still recent enough to be worth saying. This is one half of what
 * puts the dot on the monitor toolbar button; announcing the feature as new is
 * the other, and lives with the button itself.
 *
 * This owns the pref and nothing else. It has no notion of a window, so
 * repainting the button after a change is the caller's job.
 *
 * @typedef {{id: string, at: number, kind: string}} MonitorAttentionEntry
 *   A monitor id, the epoch milliseconds at which its run finished, and which
 *   ATTENTION_KINDS entry the run was.
 */
export const MonitorAttention = {
  /**
   * The monitors worth drawing attention to, whatever put them there, dropping
   * runs the user never came back for so a stale one stops being advertised.
   *
   * @returns {string[]} Monitor ids, newest run first.
   */
  get attentionIds() {
    return this.unexpiredIds(this._read());
  },

  /**
   * Only the matches, because the panel lists those under their own heading
   * while a failed check is left in place and says so on its own row.
   *
   * @returns {string[]} Monitor ids, newest match first.
   */
  get matchedIds() {
    return this.unexpiredIds(
      this._read().filter(entry => entry.kind === ATTENTION_KINDS.MATCH)
    );
  },

  /**
   * @returns {boolean} Whether any monitor has matched or failed to check
   * since the user last opened the panel.
   */
  get hasAttention() {
    return !!this.attentionIds.length;
  },

  /**
   * @param {string} monitorId - The monitor whose run met its condition.
   */
  recordMatch(monitorId) {
    this._record(monitorId, ATTENTION_KINDS.MATCH);
  },

  /**
   * @param {string} monitorId - The monitor whose run failed.
   */
  recordError(monitorId) {
    this._record(monitorId, ATTENTION_KINDS.ERROR);
  },

  clearAttention() {
    Services.prefs.clearUserPref(PREF_ATTENTION);
  },

  /**
   * Reads stored entries. Anything unrecognized reads as nothing to say rather
   * than throwing, so a corrupt value cannot take the toolbar button down with
   * it, and one bad entry does not discard the good ones around it.
   *
   * @param {string} stored - The stored JSON, or [] when nothing is stored.
   * @returns {MonitorAttentionEntry[]} Entries newest first, as stored.
   */
  parseEntries(stored) {
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
    // Only a missing kind is filled in: an entry written before the dot
    // covered failures really was a match. A kind this build doesn't know is
    // left alone instead, so it still lights the dot without matchedIds
    // mistaking it for a match.
    return parsed
      .filter(entry => entry?.id && typeof entry.at == "number")
      .map(entry => ({ ...entry, kind: entry.kind ?? ATTENTION_KINDS.MATCH }));
  },

  /**
   * @param {MonitorAttentionEntry[]} entries
   * @param {number} [now] - Epoch milliseconds to measure the lifetime against.
   * @returns {string[]} Monitor ids, newest first.
   */
  unexpiredIds(entries, now = Date.now()) {
    const cutoff = now - MONITOR_ATTENTION_LIFETIME_MS;
    return entries.filter(entry => entry.at > cutoff).map(entry => entry.id);
  },

  /**
   * Records a run, keeping one entry per monitor. The order is stored rather
   * than recovered by comparing timestamps afterwards, because two monitors
   * can finish in the same millisecond and then cannot be told apart.
   *
   * @param {MonitorAttentionEntry[]} entries
   * @param {string} monitorId - The monitor the run belongs to.
   * @param {string} [kind] - An ATTENTION_KINDS entry.
   * @param {number} [now] - Epoch milliseconds of the run.
   * @returns {MonitorAttentionEntry[]} Entries newest first, with this one at
   *   the front.
   */
  withEntry(
    entries,
    monitorId,
    kind = ATTENTION_KINDS.MATCH,
    now = Date.now()
  ) {
    const rest = entries.filter(entry => entry.id !== monitorId);
    return [{ id: monitorId, at: now, kind }, ...rest];
  },

  /**
   * @param {string} monitorId
   * @param {string} kind - An ATTENTION_KINDS entry.
   */
  _record(monitorId, kind) {
    if (!monitorId) {
      return;
    }
    Services.prefs.setStringPref(
      PREF_ATTENTION,
      JSON.stringify(this.withEntry(this._read(), monitorId, kind))
    );
  },

  /**
   * @returns {MonitorAttentionEntry[]} Entries newest first, as stored.
   */
  _read() {
    return this.parseEntries(Services.prefs.getStringPref(PREF_ATTENTION, ""));
  },
};
