/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const SURFACE_ID_RE = /^NEW_TAB_([A-Z]{2})_([A-Z]{2}|ROW|INTL)$/;

/**
 * Checks that a Merino-issued surface ID is one Merino could have derived from
 * the locale and region sent in the request, so it can't carry more
 * information than those inputs.
 *
 * @param {string} surfaceId e.g. "NEW_TAB_EN_US"
 * @param {string} locale The locale sent in the request, e.g. "en-US".
 * @param {string} [region] The region sent in the request, e.g. "US".
 * @returns {boolean}
 */
export function isPlausibleSurfaceId(surfaceId, locale, region) {
  const [, lang, market] = SURFACE_ID_RE.exec(surfaceId) ?? [];
  if (!lang || !locale) {
    return false;
  }
  // Merino treats every language it doesn't support as English.
  if (lang !== locale.slice(0, 2).toUpperCase() && lang !== "EN") {
    return false;
  }
  // Merino falls back to the locale's region when none is sent.
  const effectiveRegion =
    region || locale.match(/[_-]([a-zA-Z]{2})/)?.[1].toUpperCase();
  const defaultMarket = new Intl.Locale(lang.toLowerCase()).maximize().region;
  return [effectiveRegion, defaultMarket, "ROW", "INTL"].includes(market);
}
