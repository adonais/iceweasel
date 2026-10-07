/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { formatToken } from "../desktop-format/format-token.mjs";
import { groupAndSortTokens } from "../desktop-format/group-and-sort-tokens.mjs";
import { shouldSkipToken } from "../desktop-format/should-skip-token.mjs";

/**
 * Tokens grouped by layers.
 *
 * @typedef {object} layers
 * @property {string[]} foundation - Foundation tokens
 * @property {string[]} prefersContrast - Prefers contrast tokens
 * @property {string[]} forcedColors - Forced colors tokens
 */

/**
 * Get foundation, prefers contrast and forced colors tokens that are different
 * in Nova, checking for brand tokens, then falling back to default values.
 *
 * @param {object} dictionary - The token dictionary, provided by style-dictionary.
 * @returns {layers}
 */
export const getNewtabTokensByLayer = dictionary => {
  const overrideIdentifier = "nova";
  const tokens = dictionary.allTokens;
  const layers = {
    foundation: [],
    prefersContrast: [],
    forcedColors: [],
  };

  tokens.forEach(token => {
    if (shouldSkipToken({ overrideIdentifier, token })) {
      return;
    }

    const comment = token.comment;
    const originalName = token.name;
    let originalValue = token.original.value;
    if (token.original.value.nova?.value) {
      originalValue = token.original.value.nova.value;
    }

    const foundationToken = formatToken({
      originalName,
      originalValue: originalValue.brand ?? originalValue,
      tokens: dictionary.tokens,
      comment,
      overrideIdentifier,
    });
    if (foundationToken) {
      layers.foundation.push(foundationToken);
    }

    const prefersContrastToken = formatToken({
      originalName,
      originalValue:
        originalValue.brand?.prefersContrast ?? originalValue.prefersContrast,
      tokens: dictionary.tokens,
      comment,
      overrideIdentifier,
    });
    if (prefersContrastToken) {
      layers.prefersContrast.push(prefersContrastToken);
    }

    const forcedColorsToken = formatToken({
      originalName,
      originalValue:
        originalValue.brand?.forcedColors ?? originalValue.forcedColors,
      tokens: dictionary.tokens,
      comment,
      overrideIdentifier,
    });
    if (forcedColorsToken) {
      layers.forcedColors.push(forcedColorsToken);
    }
  });

  return {
    foundation: groupAndSortTokens({ tokens: layers.foundation }),
    prefersContrast: groupAndSortTokens({ tokens: layers.prefersContrast }),
    forcedColors: groupAndSortTokens({ tokens: layers.forcedColors }),
  };
};
