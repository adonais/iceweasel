/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { customFileHeader } from "../general/custom-file-header.mjs";
import { resolveReferences } from "./resolve-references.mjs";
import { formatTokenValue } from "./format-tokens-value.mjs";
import { formatTokensTableData } from "./format-tokens-table-data.mjs";
import { OVERRIDE_IDENTIFIERS } from "../general/override-identifiers.mjs";

export const createTokensTableFormat = (
  { dictionary },
  isSemanticTable = false
) => {
  let resolvedTokens = dictionary.allTokens
    // Exclude override tokens from stylelint/storybook token tables.
    .filter(
      token =>
        !token.override &&
        !OVERRIDE_IDENTIFIERS.some(({ id }) => token.name.includes(`-${id}-`))
    )
    .map(token => {
      let tokenVal = resolveReferences(token.original, dictionary.tokens);
      tokenVal.value = formatTokenValue(tokenVal);

      return {
        name: token.name.replace("-base", ""),
        ...tokenVal,
      };
    });

  const { tokensTable, variableLookupTable } = formatTokensTableData({
    tokens: resolvedTokens,
    isSemanticTable,
  });

  return `${customFileHeader({ platform: "tokens-table" })}
  export const tokensTable = ${JSON.stringify(tokensTable)};

  export const variableLookupTable = ${JSON.stringify(variableLookupTable)};`;
};
