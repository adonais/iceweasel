/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { OVERRIDE_IDENTIFIERS } from "../general/override-identifiers.mjs";

export const getOverrideFiles = () => {
  return OVERRIDE_IDENTIFIERS.flatMap(({ id }) => [
    {
      destination: `dist/${id}/tokens-figma-colors.json`,
      format: `json/figma/colors/${id}`,
    },
    {
      destination: `dist/${id}/tokens-figma-primitives.json`,
      format: `json/figma/primitives/${id}`,
    },
    {
      destination: `dist/${id}/tokens-figma-theme.json`,
      format: `json/figma/theme/${id}`,
    },
  ]);
};
