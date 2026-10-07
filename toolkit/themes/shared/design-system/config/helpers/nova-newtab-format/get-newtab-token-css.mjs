/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getNewtabTokensByLayer } from "./get-newtab-tokens-by-layer.mjs";

/**
 * Join formatted tokens at a given indentation. groupAndSortTokens emits
 * section headers and comment continuations at a fixed two-space indent, so
 * those are re-indented here and the trailing whitespace the join leaves on
 * blank lines is stripped.
 *
 * @param {string[]} tokens - Formatted token declarations.
 * @param {number} indent - Number of spaces each line is indented by.
 * @returns {string}
 */
const joinTokens = (tokens, indent) => {
  const padding = " ".repeat(indent);
  return tokens
    .join(`\n${padding}`)
    .replaceAll(`${padding}\n`, "\n")
    .replaceAll("\n  /**", `\n${padding}/**`)
    .replaceAll("\n  --", `\n${padding}--`);
};

export const getNewtabTokenCSS = ({ dictionary }) => {
  let content = "";

  const { foundation, prefersContrast, forcedColors } =
    getNewtabTokensByLayer(dictionary);

  if (foundation.length) {
    content += `@layer tokens-foundation-nova {
  :root.nova-tokens {${joinTokens(foundation, 4)}
  }
}`;
  }

  if (prefersContrast.length) {
    content += `\n\n@layer tokens-prefers-contrast-nova {
  @media (prefers-contrast) {
    :root.nova-tokens {${joinTokens(prefersContrast, 6)}
    }
  }
}`;
  }

  if (forcedColors.length) {
    content += `\n\n@layer tokens-forced-colors-nova {
  @media (forced-colors) {
    :root.nova-tokens {${joinTokens(forcedColors, 6)}
    }
  }
}`;
  }

  return content;
};
