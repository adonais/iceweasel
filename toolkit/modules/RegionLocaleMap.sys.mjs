/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Shared matching for features that ship market by market, gated on the pair
 * (home region, app locale).
 *
 * A list is a Map-like array of `[region, localePatterns]` entries, normally
 * held as JSON in a pref so that it can be adjusted through Nimbus, for example
 * `[["US",["en-*"]],["FR",["en-*","fr-*"]]]`. A locale pattern ending with "*"
 * matches any locale starting with its prefix, and the region "*" matches any
 * region, including one that has not been detected yet. Entries are OR-ed, so
 * `[["FR",["en-*"]],["*",["fr-*"]]]` reads as "France in English, or a French
 * locale anywhere".
 */

/**
 * @typedef {[string, string[]][]} RegionLocaleEntries
 */

/**
 * An immutable region / locale list, normally built from a pref through
 * {@link RegionLocaleMap.fromJSON} and queried with
 * {@link RegionLocaleMap.matches}.
 */
export class RegionLocaleMap {
  /** @type {Map<string, string[]>} */
  #localePatternsByRegion;

  /**
   * @param {RegionLocaleEntries} [entries]
   *   Region / locale pattern pairs. Regions and patterns are normalized, so
   *   the casing used here doesn't matter.
   */
  constructor(entries = []) {
    this.#localePatternsByRegion = new Map(
      entries.map(([region, localePatterns]) => [
        region.toUpperCase(),
        localePatterns.map(pattern => pattern.toLowerCase()),
      ])
    );
  }

  /**
   * Builds a map from the JSON string held by a pref.
   *
   * @param {string} json
   *   JSON encoding of {@link RegionLocaleEntries}.
   * @param {object} [options]
   * @param {RegionLocaleEntries} [options.fallback]
   *   Entries to use when `json` cannot be parsed. Note that an empty string is
   *   not a parse failure: users may empty a pref to disable a feature, without
   *   knowing it should hold a JSON string, so that yields an empty map.
   * @param {Function} [options.onInvalid]
   *   Invoked with the unparseable value, to let the caller log it.
   * @returns {RegionLocaleMap}
   */
  static fromJSON(json, { fallback = [], onInvalid } = {}) {
    if (json === "") {
      return new RegionLocaleMap();
    }
    try {
      return new RegionLocaleMap(JSON.parse(json));
    } catch (ex) {
      onInvalid?.(json);
      return new RegionLocaleMap(fallback);
    }
  }

  /**
   * Whether the given region and locale are covered by this map.
   *
   * @param {?string} region
   *   Region code, may be null before region detection has resolved. Only the
   *   "*" entry can then match.
   * @param {string} appLocale
   *   BCP 47 language tag.
   * @returns {boolean}
   */
  matches(region, appLocale) {
    // Per BCP-47 comparisons must be performed in a case-insensitive manner.
    appLocale = appLocale.toLowerCase();
    const localePatterns = [
      ...(this.#localePatternsByRegion.get(region?.toUpperCase()) ?? []),
      ...(this.#localePatternsByRegion.get("*") ?? []),
    ];
    return localePatterns.some(pattern =>
      pattern.endsWith("*")
        ? appLocale.startsWith(pattern.replace(/-?\*$/, ""))
        : pattern == appLocale
    );
  }
}
