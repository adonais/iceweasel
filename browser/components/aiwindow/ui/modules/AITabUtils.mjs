/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Returns the href parsed as an http(s) URL, or null for anything else. Hrefs
 * in a generated page can also be in-app route ids, which must not become
 * links.
 *
 * @param {string} href
 * @returns {?URL}
 */
export function httpUrl(href) {
  const parsed = URL.parse(String(href ?? "").trim());
  return parsed?.protocol == "http:" || parsed?.protocol == "https:"
    ? parsed
    : null;
}
