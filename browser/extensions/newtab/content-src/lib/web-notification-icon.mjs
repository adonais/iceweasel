/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Notification icons are third-party URLs chosen by the notifying site. Loading
// one directly would tell that site the user's IP and when their New Tab
// rendered, so icons go through the same image proxy the stories use: the fetch
// is made by the CDN rather than by the user. Resizing comes along for free.
const IMAGE_PROXY_ORIGIN = "https://img-getpocket.cdn.mozilla.net";

// Icons render at --size-item-large (32px); request 2x so they stay sharp on
// HiDPI. `no_upscale()` leaves a smaller source alone rather than blowing it up.
const ICON_SIZE = 64;

const PROXY_FILTERS =
  "filters:format(webp):quality(75):no_upscale():strip_exif()";

/**
 * The proxied URL for a notification icon.
 *
 * Returns null for anything that cannot be proxied, and callers then render no
 * icon at all rather than falling back to the origin URL — a fallback would
 * reintroduce the direct third-party load this exists to prevent.
 *
 * @param {string} [url] The icon URL the notification carried.
 * @returns {?string}
 */
export function proxiedIconUrl(url) {
  if (!url) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return null;
  }
  if (parsed.protocol !== "https:") {
    return null;
  }
  return `${IMAGE_PROXY_ORIGIN}/${ICON_SIZE}x${ICON_SIZE}/${PROXY_FILTERS}/${encodeURIComponent(
    url
  )}`;
}
