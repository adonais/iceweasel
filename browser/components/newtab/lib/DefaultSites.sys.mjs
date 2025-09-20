/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const DEFAULT_SITES_MAP = new Map([
  // This first item is the global list fallback for any unexpected geos
  [
    "",
    "",
  ],
]);

// Immutable for export.
export const DEFAULT_SITES = Object.freeze(DEFAULT_SITES_MAP);
