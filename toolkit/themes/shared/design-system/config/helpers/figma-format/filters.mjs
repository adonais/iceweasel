/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { OVERRIDE_IDENTIFIERS } from "../general/override-identifiers.mjs";

/**
 * Combines multiple filter functions into a single filter function.
 *
 * @param {...Function} filters - One or more filter functions to combine.
 * @returns {Function} A new filter function that applies all provided filters.
 */
export const mergeFilters = (...filters) => {
  return token => {
    for (const filter of filters) {
      if (!filter(token)) {
        return false;
      }
    }
    return true;
  };
};

export const defaultFilter = token => {
  // discard tokens starting with "font/"
  if (token.path.includes("font")) {
    return false;
  }
  return true;
};

export const overrideFilter = (token, overrideIdentifier) => {
  // discard tokens not belonging to the specified set of override tokens
  if (
    overrideIdentifier &&
    !(
      token.name.includes(`/${overrideIdentifier}`) ||
      token.original.value[overrideIdentifier]?.value
    )
  ) {
    return false;
  }

  // discard override tokens from the base set
  if (
    !overrideIdentifier &&
    (token.override ||
      OVERRIDE_IDENTIFIERS.some(({ id }) => token.name.includes(`/${id}`)))
  ) {
    return false;
  }

  return true;
};

export const filterBase = pathItem => {
  return pathItem !== "@base";
};
