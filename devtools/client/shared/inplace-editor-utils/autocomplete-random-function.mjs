/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const RANDOM_KEYWORDS = [
  "auto",
  "element-scoped",
  "fixed",
  "property-index-scoped",
  "property-scoped",
];

/**
 * Compute the autocomplete data for the random() function.
 *
 * @param {object} params
 * @param {Array<InspectorCSSToken>} params.functionTokens
 *        The tokens representing the function parameters.
 * @returns {object} An object containing the autocomplete items in `list`.
 */
export function getAutocompleteDataForRandomFunction({ functionTokens }) {
  // <random()> = random( <random-key>? , <calc-sum>, <calc-sum>, <calc-sum>? )
  // <random-key> = auto | <random-cache-key> | fixed <number [0,1]>
  // <random-cache-key> =  <dashed-ident> || element-scoped
  //                       || [ property-scoped | property-index-scoped | <random-ua-ident> ]
  // <random-ua-ident> = <custom-ident>
  const lastToken = functionTokens.at(-1);
  const isLastTokenComplete = !!lastToken?.complete;

  let hasComma = false;
  let hasDashedIdentCacheKey = false;
  let hasElementScoped = false;
  let hasPropertyScope = false;

  for (const token of functionTokens) {
    if (token === lastToken && !isLastTokenComplete) {
      continue;
    }

    if (token.tokenType === "Comma") {
      hasComma = true;
      break;
    }

    if (token.tokenType === "Ident" && token.text.startsWith("--")) {
      hasDashedIdentCacheKey = true;
    }

    if (token.tokenType === "Ident" && token.text === "element-scoped") {
      hasElementScoped = true;
    }

    if (
      token.tokenType === "Ident" &&
      (token.text === "property-scoped" ||
        token.text === "property-index-scoped")
    ) {
      hasPropertyScope = true;
    }
  }

  if (hasComma) {
    return { list: [] };
  }

  if (hasElementScoped && hasPropertyScope) {
    return { list: [] };
  }

  if (hasElementScoped) {
    return {
      list: ["property-index-scoped", "property-scoped"],
    };
  }

  if (hasPropertyScope) {
    return { list: ["element-scoped"] };
  }

  if (hasDashedIdentCacheKey) {
    return {
      list: ["element-scoped", "property-index-scoped", "property-scoped"],
    };
  }

  if (
    functionTokens.length === 0 ||
    (functionTokens.length === 1 && !isLastTokenComplete)
  ) {
    return { list: RANDOM_KEYWORDS };
  }

  return { list: [] };
}
