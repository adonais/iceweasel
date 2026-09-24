/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { formatToken } from "./format-token.mjs";
import { getBrowserThemeValue } from "./get-browser-theme-value.mjs";
import { groupAndSortTokens } from "./group-and-sort-tokens.mjs";
import { shouldSkipToken } from "./should-skip-token.mjs";

export const getTokensByLayer = ({
  surface,
  dictionary,
  componentName = "",
  overrideIdentifier = "",
}) => {
  const tokens = dictionary.allTokens;
  const layers = {
    foundation: [],
    browserTheme: [],
    prefersContrast: [],
    forcedColors: [],
  };

  tokens.forEach(token => {
    if (shouldSkipToken({ overrideIdentifier, componentName, token })) {
      return;
    }

    const comment = token.comment;
    const originalName = token.name;
    let originalValue = token.original.value;
    if (overrideIdentifier && token.original.value[overrideIdentifier]?.value) {
      originalValue = token.original.value[overrideIdentifier].value;
    }

    const browserThemeValue = getBrowserThemeValue({
      surface,
      token,
      originalValue,
    });

    const foundationToken = formatToken({
      originalName,
      originalValue: surface ? browserThemeValue[surface] : browserThemeValue,
      tokens: dictionary.tokens,
      comment,
      overrideIdentifier,
    });
    if (foundationToken) {
      layers.foundation.push(foundationToken);
    }

    const browserThemeToken = formatToken({
      originalName,
      originalValue: surface
        ? browserThemeValue[surface]?.browserTheme
        : browserThemeValue.browserTheme,
      tokens: dictionary.tokens,
      comment,
      overrideIdentifier,
    });
    if (browserThemeToken) {
      layers.browserTheme.push(browserThemeToken);
    }

    const prefersContrastToken = formatToken({
      originalName,
      originalValue: surface
        ? originalValue[surface]?.prefersContrast
        : originalValue.prefersContrast,
      tokens: dictionary.tokens,
      comment,
      overrideIdentifier,
    });
    if (prefersContrastToken) {
      layers.prefersContrast.push(prefersContrastToken);
    }

    const forcedColorsToken = formatToken({
      originalName,
      originalValue: surface
        ? originalValue[surface]?.forcedColors
        : originalValue.forcedColors,
      tokens: dictionary.tokens,
      comment,
      overrideIdentifier,
    });
    if (forcedColorsToken) {
      layers.forcedColors.push(forcedColorsToken);
    }
  });

  return {
    foundation: groupAndSortTokens({
      tokens: layers.foundation,
      componentName,
    }),
    browserTheme: groupAndSortTokens({
      tokens: layers.browserTheme,
      componentName,
    }),
    prefersContrast: groupAndSortTokens({
      tokens: layers.prefersContrast,
      componentName,
    }),
    forcedColors: groupAndSortTokens({
      tokens: layers.forcedColors,
      componentName,
    }),
  };
};
