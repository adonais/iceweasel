/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { TOKEN_CATEGORIES } from "../general/token-categories.mjs";

export const getTokenCategoryName = (tokenName, purpose) => {
  // Use the token's name to determine the category it belongs to.
  // e.g. --button-background-color-primary goes to "background-color"
  const matchingCategory = TOKEN_CATEGORIES.find(
    ({ categoryName, alternateNames, purposes }) => {
      if (!purposes.includes(purpose)) {
        return false;
      }

      const matchesAsSegment = n =>
        new RegExp(`(^|-)${n}(-|$)`).test(tokenName);

      return (
        matchesAsSegment(categoryName) || alternateNames?.some(matchesAsSegment)
      );
    }
  );

  if (!matchingCategory) {
    return "uncategorized";
  }

  return matchingCategory.categoryName;
};
