/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { customFileHeader } from "../general/custom-file-header.mjs";
import { getTokenCSS } from "./get-token-css.mjs";
import { OVERRIDE_IDENTIFIERS } from "../general/override-identifiers.mjs";

export const createDesktopFormat =
  ({ surface, componentName } = {}) =>
  ({ dictionary, file }) => {
    let content = customFileHeader({ surface, file });
    let { sharedLayers, browserThemeLayers } = getTokenCSS({
      surface,
      componentName,
      dictionary,
    });

    OVERRIDE_IDENTIFIERS.forEach(({ id, pref }) => {
      const overrideLayers = getTokenCSS({
        surface,
        componentName,
        dictionary,
        overrideIdentifier: id,
      });
      if (overrideLayers.sharedLayers) {
        sharedLayers += `\n\n  @media -moz-pref("${pref}") {
    ${overrideLayers.sharedLayers}
  }`;
      }

      if (overrideLayers.browserThemeLayers) {
        browserThemeLayers += `\n\n  @media -moz-pref("${pref}") {
    ${overrideLayers.browserThemeLayers}
  }`;
      }
    });

    content += `:root,
:host${componentName ? "" : "(.anonymous-content-host)"} {
  ${sharedLayers}
}`;

    if (browserThemeLayers) {
      content += `\n\n:root:is([theme-in-app], :not([lwtheme])),
:host${componentName ? "" : "(.anonymous-content-host)"} {
  ${browserThemeLayers}
}`;
    }

    return `${content}\n`;
  };
