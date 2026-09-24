/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getComponentInfo } from "../general/get-component-info.mjs";
import { PURPOSE, TOKEN_CATEGORIES } from "../general/token-categories.mjs";

export const getTokenSections = () => {
  const componentSections = getComponentInfo().reduce(
    (components, { componentName }) => ({
      ...components,
      [componentName]: componentName,
    }),
    {}
  );

  const baseSections = TOKEN_CATEGORIES.filter(({ purposes }) =>
    purposes.includes(PURPOSE.SEMANTIC)
  ).reduce((sections, { categoryName }) => {
    return {
      ...sections,
      [categoryName]: categoryName,
    };
  }, {});

  const allSections = {
    ...baseSections,
    ...componentSections,
  };

  return Object.fromEntries(
    Object.keys(allSections)
      // moz-box interferes with box-shadow tokens, so put "box" at the end of the list
      .sort((a, b) => (a > b || a === "box" ? 1 : -1))
      .map(key => [key, allSections[key]])
  );
};
