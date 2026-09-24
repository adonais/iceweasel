/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getNewtabTokensByLayer } from "./get-newtab-tokens-by-layer.mjs";

export const getNewtabTokenCSS = ({ dictionary }) => {
  let content = "";

  const { foundation, forcedColors } = getNewtabTokensByLayer(dictionary);

  if (foundation.length) {
    content += `:root.nova-tokens {${foundation.join("\n  ").replaceAll("  \n", "\n")}
}`;
  }

  if (forcedColors.length) {
    content += `\n\n@media (forced-colors) {
  :root.nova-tokens {${forcedColors.join("\n    ").replaceAll("    \n", "\n").replaceAll("  /**", "    /**").replaceAll("\n  --", "\n    --")}
  }
}`;
  }

  return content;
};
