/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { COLLECTIONS } from "./constants.mjs";
import { filterBase } from "./filters.mjs";
import { parseBoxShadow } from "./parse-box-shadow.mjs";

/**
 * Attempts to destructure a shadow token into its individual components.
 * This function processes a token with a potential shadow value,
 * and attempts to parse it into subtokens with destructured shadow properties.
 *
 * @param {object} token - The token object to process.
 * @param {string} originalVal - The original value of the token, expected to be a string.
 * @returns {Array<object>|undefined} An array of new with destructured shadow properties,
 * or `undefined` if the token is not a shadow or cannot be parsed.
 */
export const attemptShadowDestructuring = (token, originalVal) => {
  if (!token.path.includes("box-shadow") || typeof originalVal !== "string") {
    return undefined;
  }

  // check if originalVal contains at least a space
  if (!originalVal.includes(" ")) {
    return undefined;
  }

  let shadows;

  try {
    shadows = parseBoxShadow(originalVal);
  } catch (e) {
    console.warn("[attemptShadowDestructuring] Error parsing shadow:", e);
    return undefined;
  }

  if (shadows.length === 0) {
    return undefined;
  }

  const subtokens = shadows.flatMap((shadow, index) => {
    const path =
      shadows.length > 1 ? [...token.path, `shadow-${index + 1}`] : token.path;
    return Object.entries(shadow).map(([key, value]) => {
      // Every part of the shadow but the color can be put
      // in the primitive collection
      let collection = token.attributes?.collection;
      if (key === "color") {
        collection = COLLECTIONS.theme;
      }

      const copy = {
        ...token,
        path: [...path, key].filter(filterBase),
        name: [...path, key].filter(filterBase).join("/"),
        value,
        original: { ...token.original, value },
        attributes: {
          ...token.attributes,
          collection,
        },
      };
      return { token: copy, originalVal: value };
    });
  });

  return subtokens;
};
