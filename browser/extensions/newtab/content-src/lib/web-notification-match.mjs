/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Some apps serve their app (and register their notification service worker)
// on a subdomain, but users pin the apex. A tile at the apex would never match
// the origin its notifications are stored under. These aliases redirect the
// apex (and www) to that app origin. Kept explicit rather than collapsing to a
// registrable domain, which would wrongly merge unrelated siblings such as
// Google's mail/calendar/docs onto a single tile.
const ORIGIN_ALIASES = new Map([
  ["https://gmail.com", "https://mail.google.com"],
  ["https://www.gmail.com", "https://mail.google.com"],
  ["https://slack.com", "https://app.slack.com"],
  ["https://www.slack.com", "https://app.slack.com"],
]);

// Stable reference so selectors don't return a fresh array on every store
// update for sites with no notifications.
const EMPTY_IDS = Object.freeze([]);

/**
 * @param {string} url
 * @returns {?string} The http(s) origin, or null for other schemes / bad input.
 */
export function originFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch (e) {
    return null;
  }
}

/**
 * The origin a tile's notifications are stored under, resolving known apex
 * aliases. Unknown origins pass through unchanged, so the worst case is an
 * exact-match miss, never a wrong-app match.
 *
 * @param {string} url
 * @returns {?string}
 */
export function notificationKeyForUrl(url) {
  const siteOrigin = originFromUrl(url);
  if (!siteOrigin) {
    return null;
  }
  return ORIGIN_ALIASES.get(siteOrigin) ?? siteOrigin;
}

/**
 * The stored notification ids for the site a tile points at.
 *
 * @param {object} state Newtab Redux state.
 * @param {string} url The tile's url.
 * @returns {string[]}
 */
export function getNotificationIdsForUrl(state, url) {
  const key = notificationKeyForUrl(url);
  return (key && state.WebNotifications.byOrigin[key]) || EMPTY_IDS;
}

/**
 * Whether to render any web notifications surface. The feature has to exist for
 * this profile (`system.showWebNotifications`, or a trainhop enrollment via
 * `trainhopConfig.webNotifications.enabled`, which is also what decides whether
 * the customize toggle is offered at all) and the user has to want it
 * (`showWebNotifications`, what that toggle writes).
 *
 * @param {object} state Newtab Redux state.
 * @returns {boolean}
 */
export function isWebNotificationsEnabled(state) {
  const prefs = state.Prefs.values;
  const systemEnabled =
    prefs["system.showWebNotifications"] ||
    prefs.trainhopConfig?.webNotifications?.enabled;
  return Boolean(systemEnabled && prefs.showWebNotifications);
}
