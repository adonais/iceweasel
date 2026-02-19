/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import noBaseDesignTokens from "./no-base-design-tokens.mjs";
import noBrowserRefsInToolkit from "./no-browser-refs-in-toolkit.mjs";
import useDesignTokens from "./use-design-tokens.mjs";
import noNonSemanticTokenUsage from "./no-non-semantic-token-usage.mjs";
import useSizeTokens from "./use-size-tokens.mjs";

export default {
  "no-base-design-tokens": noBaseDesignTokens,
  "no-browser-refs-in-toolkit": noBrowserRefsInToolkit,
  "use-design-tokens": useDesignTokens,
  "no-non-semantic-token-usage": noNonSemanticTokenUsage,
  "use-size-tokens": useSizeTokens,
};
