/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getTokensByLayer } from "./get-tokens-by-layer.mjs";

export const getTokenCSS = ({
  surface,
  componentName,
  dictionary,
  overrideIdentifier,
}) => {
  let sharedLayers = "";
  let browserThemeLayers = "";

  const { foundation, browserTheme, prefersContrast, forcedColors } =
    getTokensByLayer({
      surface,
      componentName,
      dictionary,
      overrideIdentifier,
    });

  if (foundation.length) {
    sharedLayers += `@layer tokens-foundation${surface === "brand" ? "-brand" : ""}${overrideIdentifier ? `-${overrideIdentifier}` : ""} {
    ${foundation.join("\n  ")}
  }`;
  }

  if (prefersContrast.length) {
    sharedLayers += `\n\n  @layer tokens-prefers-contrast${overrideIdentifier ? `-${overrideIdentifier}` : ""} {
    @media (prefers-contrast) {
      ${prefersContrast.join("\n      ")}
    }
  }`;
  }

  if (forcedColors.length) {
    sharedLayers += `\n\n  @layer tokens-forced-colors${overrideIdentifier ? `-${overrideIdentifier}` : ""} {
    @media (forced-colors) {
      ${forcedColors.join("\n      ")}
    }
  }
`;
  }

  if ((surface === "platform" || componentName) && browserTheme.length) {
    browserThemeLayers += `@layer tokens-browser-theme${overrideIdentifier ? `-${overrideIdentifier}` : ""} {
  @media not ((forced-colors) or (-moz-native-theme)) {
      ${browserTheme.join("\n      ")}
    }
  }`;
  }

  return {
    sharedLayers,
    browserThemeLayers,
  };
};
