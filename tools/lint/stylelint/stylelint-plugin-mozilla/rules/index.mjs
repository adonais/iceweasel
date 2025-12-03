/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import noBaseDesignTokens from "./no-base-design-tokens.mjs";
import noBrowserRefsInToolkit from "./no-browser-refs-in-toolkit.mjs";
import useBorderRadiusTokens from "./use-border-radius-tokens.mjs";
import useBorderColorTokens from "./use-border-color-tokens.mjs";
import useFontSizeTokens from "./use-font-size-tokens.mjs";
import useFontWeightTokens from "./use-font-weight-tokens.mjs";
import useSpaceTokens from "./use-space-tokens.mjs";
import useBackgroundColorTokens from "./use-background-color-tokens.mjs";
import useTextColorTokens from "./use-text-color-tokens.mjs";
import useBoxShadowTokens from "./use-box-shadow-tokens.mjs";
import noNonSemanticTokenUsage from "./no-non-semantic-token-usage.mjs";
import useSizeTokens from "./use-size-tokens.mjs";

export default {
  "no-base-design-tokens": noBaseDesignTokens,
  "no-browser-refs-in-toolkit": noBrowserRefsInToolkit,
  "use-border-radius-tokens": useBorderRadiusTokens,
  "use-border-color-tokens": useBorderColorTokens,
  "use-font-size-tokens": useFontSizeTokens,
  "use-font-weight-tokens": useFontWeightTokens,
  "use-space-tokens": useSpaceTokens,
  "use-background-color-tokens": useBackgroundColorTokens,
  "use-text-color-tokens": useTextColorTokens,
  "use-box-shadow-tokens": useBoxShadowTokens,
  "no-non-semantic-token-usage": noNonSemanticTokenUsage,
  "use-size-tokens": useSizeTokens,
};
