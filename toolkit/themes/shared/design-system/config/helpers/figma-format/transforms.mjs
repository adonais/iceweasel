/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { attemptShadowDestructuring } from "./attempt-shadow-destructuring.mjs";
import { attemptPaddingMarginDestructuring } from "./attempt-padding-margin-destructuring.mjs";
import { COLLECTIONS } from "./constants.mjs";
import { isNestedDefaultObject } from "./is-nested-default-object.mjs";
import { OVERRIDE_IDENTIFIERS } from "../general/override-identifiers.mjs";

export const figmaNameTransform = {
  type: "name",
  name: "name/figma",
  transform: token => token.path.join("/").replace("/@base", ""),
};

export const figmaAttributeTransform = {
  type: "attribute",
  name: "attribute/figma",
  transform: token => {
    // Collection attribute
    let collection = COLLECTIONS.theme;

    if (
      (typeof token.value !== "object" || isNestedDefaultObject(token.value)) &&
      token.value !== "currentColor"
    ) {
      if (token.path[0] === "color") {
        collection = COLLECTIONS.colors;
      } else {
        collection = COLLECTIONS.primitives;
      }
    }

    if (
      token.override &&
      OVERRIDE_IDENTIFIERS.some(({ id }) => {
        const tokenValue = token.value[id]?.value;
        return (
          tokenValue &&
          (typeof tokenValue !== "object" ||
            isNestedDefaultObject(tokenValue)) &&
          tokenValue !== "currentColor"
        );
      })
    ) {
      if (token.path[0] === "color") {
        collection = COLLECTIONS.colors;
      } else {
        collection = COLLECTIONS.primitives;
      }
    }

    // willBeDestructured attribute
    let willBeDestructured = false;
    const originalVal = token.original.value;
    if (
      attemptShadowDestructuring(token, originalVal) ||
      attemptPaddingMarginDestructuring(token, originalVal)
    ) {
      willBeDestructured = true;
    }

    // tokens referencing other tokens that have forcedColors, prefersContrast, etc. values
    // should not be considered primitive tokens
    if (
      ((typeof token.value === "string" &&
        token.value.includes("[object Object]")) ||
        (typeof token.value.default === "string" &&
          token.value.default.includes("[object Object]"))) &&
      !willBeDestructured
    ) {
      collection = COLLECTIONS.theme;
    }

    return { collection, willBeDestructured };
  },
};
