/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const TYPE_ICO = "image/x-icon";
export const TYPE_SVG = "image/svg+xml";

// URL schemes that we don't want to load and convert to data URLs.
export const TRUSTED_FAVICON_SCHEMES = Object.freeze([
  "chrome",
  "about",
  "resource",
]);

/**
 * Converts a Blob into a data: URL.
 *
 * @param {Blob} blob The Blob to be converted.
 * @returns {Promise<string>} Returns a promise that resolves with the data: URL
 *                            or rejects with an error.
 */
export function blobAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(blob);
  });
}
