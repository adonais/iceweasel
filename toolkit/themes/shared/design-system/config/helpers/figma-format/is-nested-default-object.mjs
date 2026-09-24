/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { OVERRIDE_IDENTIFIERS } from "../general/override-identifiers.mjs";

/**
 * Determines if a given value is an arbitrarily deeply nested object
 * that satisfies the following conditions:
 * - Each object in the nesting hierarchy has exactly one key-value pair.
 * - The last key in the nesting hierarchy is "default".
 * - The value associated with the "default" key is a primitive (not an object).
 * - The value associated with the "default" key is not "currentColor".
 *
 * @param {object} value - The value to check, expected to be an object.
 * @returns {boolean} Returns `true` if the object matches the criteria,
 */
export const isNestedDefaultObject = value => {
  let current = value;

  OVERRIDE_IDENTIFIERS.forEach(({ id }) => {
    // ignore any nested override keys in the value object
    delete current[id];
  });

  while (typeof current === "object") {
    const keys = Object.keys(current);
    if (keys.length !== 1) {
      return false;
    }
    const key = keys[0];
    if (key === "default") {
      if (typeof current[key] === "object") {
        return false;
      }
      if (current[key] === "currentColor") {
        return false;
      }
      return true;
    }
    current = current[key];
  }
  return false;
};
