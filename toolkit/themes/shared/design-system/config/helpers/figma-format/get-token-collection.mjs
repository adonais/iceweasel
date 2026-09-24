/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line import/no-unresolved
import { getReferences, usesReferences } from "style-dictionary/utils";
import { COLLECTIONS } from "./constants.mjs";
import { isNestedDefaultObject } from "./is-nested-default-object.mjs";

export const getTokenCollection = (
  token,
  dictionary,
  overrideIdentifier = ""
) => {
  if (!overrideIdentifier || !token.original.value[overrideIdentifier]?.value) {
    return token.attributes?.collection;
  }

  let collection = COLLECTIONS.theme;
  let originalValue = token.original.value[overrideIdentifier].value;

  if (
    (typeof originalValue !== "object" ||
      isNestedDefaultObject(originalValue)) &&
    originalValue !== "currentColor"
  ) {
    if (token.path[0] === "color") {
      collection = COLLECTIONS.colors;
    } else {
      collection = COLLECTIONS.primitives;
    }

    // if any referenced tokens are theme tokens, categorize this as a theme token
    if (usesReferences(originalValue)) {
      if (
        getReferences(originalValue, dictionary.tokens).some(
          reference => reference.attributes?.collection === COLLECTIONS.theme
        )
      ) {
        collection = COLLECTIONS.theme;
      }
    }
  }

  return collection;
};
