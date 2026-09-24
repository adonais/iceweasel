/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Retrieves the nested system color value from a token object.
 * The function traverses through the token's properties (`forcedColors`, `prefersContrast`, `default`)
 * until it resolves to a non-object value.
 *
 * @param {object} token - The token object containing nested system color definitions.
 * @returns {string|number|boolean|null|undefined} - The resolved system color value.
 */
export const getNestedSystemColor = token => {
  let current = token;
  while (typeof current === "object") {
    current =
      current.forcedColors ?? current.prefersContrast ?? current.default;
  }
  return current;
};
