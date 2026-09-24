/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line import/no-unresolved
import { usesReferences } from "style-dictionary/utils";
import { COLLECTIONS } from "./constants.mjs";
import { getNestedBrandColor } from "./get-nested-brand-color.mjs";
import { getNestedSystemColor } from "./get-nested-system-color.mjs";
import { OVERRIDE_IDENTIFIERS } from "../general/override-identifiers.mjs";
import { potentiallyTransformValue } from "./potentially-transform-value.mjs";
import { replaceReferences } from "./replace-references.mjs";

/**
 * Transforms the value of a design token by resolving references, handling `calc()` expressions,
 * and applying specific transformations for light, dark, and forced color modes.
 *
 * @param {object} token - The token object containing metadata and the value to transform.
 * @param {string|object} originalVal - The original value of the token, which can be a string or an object.
 * @param {object} dictionary - Dictionary object from Style Dictionary
 * @param {string} overrideIdentifier - Name of the set of overrides being processed.
 * @returns {object} - A new token object with the transformed value.
 */
export const transformTokenValue = (
  token,
  originalVal,
  dictionary,
  overrideIdentifier
) => {
  let newValue = originalVal;
  let newName = token.name;

  OVERRIDE_IDENTIFIERS.forEach(({ id }) => {
    if (token.name.includes(id)) {
      newName = token.name.replace(`/${id}`, "");
    }
  });

  if (
    (overrideIdentifier &&
      token.value[overrideIdentifier]?.value &&
      typeof token.value[overrideIdentifier].value === "object") ||
    typeof token.value === "object" ||
    (typeof token.value === "string" && token.value.includes("[object Object]"))
  ) {
    const brandValue = getNestedBrandColor(originalVal);
    const forcedColorsValue = getNestedSystemColor(originalVal);

    // If this token got assigned to the primitive collection, we know it
    // only contains a single value, so we can just the light value
    if (token.attributes?.collection === COLLECTIONS.primitives) {
      newValue = replaceReferences(brandValue?.light, dictionary.tokens);
    } else {
      newValue = {
        light: brandValue?.light
          ? replaceReferences(brandValue?.light, dictionary.tokens)
          : "transparent",
        dark: brandValue?.dark
          ? replaceReferences(brandValue?.dark, dictionary.tokens)
          : "transparent",
        forcedColors: replaceReferences(forcedColorsValue, dictionary.tokens),
      };

      if (
        newValue.forcedColors === undefined &&
        newValue.light === newValue.dark
      ) {
        newValue.forcedColors = newValue.light;
      } else if (newValue.forcedColors === undefined) {
        newValue.forcedColors = "transparent";
      }
    }
  } else if (usesReferences(newValue)) {
    newValue = replaceReferences(newValue, dictionary.tokens);
  }

  if (typeof newValue === "object") {
    Object.keys(newValue).forEach(key => {
      newValue[key] = potentiallyTransformValue(token, newValue[key]);
    });
  } else {
    newValue = potentiallyTransformValue(token, newValue);
  }

  return { ...token, name: newName, value: newValue };
};
