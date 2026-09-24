/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { replaceReferences } from "../general/replace-references.mjs";

export const formatToken = ({
  originalName,
  originalValue,
  tokens,
  comment = null,
  overrideIdentifier = "",
}) => {
  if (originalValue == null) {
    return null;
  }

  let tokenName = originalName.replace("-base", "");
  if (overrideIdentifier) {
    tokenName = tokenName.replace(`${overrideIdentifier}-`, "");
  }

  if (typeof originalValue === "string" || typeof originalValue === "number") {
    return {
      comment,
      token: `--${tokenName}: ${replaceReferences(originalValue, tokens)};`,
    };
  }

  if (originalValue.default) {
    return {
      comment,
      token: `--${tokenName}: ${replaceReferences(originalValue.default, tokens)};`,
    };
  }

  if (originalValue.light && originalValue.dark) {
    return {
      comment,
      token: `--${tokenName}: light-dark(${replaceReferences(originalValue.light, tokens)}, ${replaceReferences(originalValue.dark, tokens)});`,
    };
  }

  return null;
};
