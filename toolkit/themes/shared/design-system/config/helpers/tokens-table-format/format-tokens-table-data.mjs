/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PURPOSE } from "../general/token-categories.mjs";
import { getTokenCategoryName } from "./get-token-category-name.mjs";

export const formatTokensTableData = ({ tokens, isSemanticTable }) => {
  const tokensTable = {};
  const variableLookupTable = {};

  for (const token of tokens) {
    variableLookupTable[token.name] = token.value;
    const formattedToken = {
      value: token.value,
      name: `--${token.name}`,
    };

    const tableName = getTokenCategoryName(
      token.name,
      isSemanticTable ? PURPOSE.SEMANTIC : PURPOSE.STORYBOOK
    );

    if (tokensTable[tableName]) {
      tokensTable[tableName].push(formattedToken);
    } else {
      tokensTable[tableName] = [formattedToken];
    }
  }

  return { tokensTable, variableLookupTable };
};
