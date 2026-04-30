/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { BANDWIDTH } from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

const countryDisplayNames = new Intl.DisplayNames(undefined, {
  type: "region",
});

/**
 * Returns the localized country name for a given country code.
 *
 * @param {string} code
 * @returns {string|null}
 */
export function countryName(code) {
  try {
    return countryDisplayNames.of(code) ?? null;
  } catch (_) {
    return null;
  }
}

/**
 * Formats remaining bandwidth bytes into a rounded value with a unit indicator.
 *
 * @param {number} remainingBytes - Remaining bandwidth in bytes.
 * @returns {{ value: number, useGB: boolean }}
 *   `value` is the remaining amount rounded to the nearest 0.1 GB (when >= 1 GB)
 *   or floored to the nearest MB (when < 1 GB). `useGB` indicates whether the
 *   value is in GB (true) or MB (false).
 */
export function formatRemainingBandwidth(remainingBytes) {
  const remainingGB = remainingBytes / BANDWIDTH.BYTES_IN_GB;
  if (remainingGB < 1) {
    return {
      value: Math.floor(remainingBytes / BANDWIDTH.BYTES_IN_MB),
      useGB: false,
    };
  }
  return { value: parseFloat(remainingGB.toFixed(1)), useGB: true };
}
