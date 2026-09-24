/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createFigmaFormat } from "./create-figma-format.mjs";
import { COLLECTIONS } from "./constants.mjs";
import { OVERRIDE_IDENTIFIERS } from "../general/override-identifiers.mjs";

export const getOverrideFormats = () => {
  return OVERRIDE_IDENTIFIERS.reduce(
    (config, { id }) => ({
      ...config,
      [`json/figma/colors/${id}`]: createFigmaFormat(COLLECTIONS.colors, id),
      [`json/figma/primitives/${id}`]: createFigmaFormat(
        COLLECTIONS.primitives,
        id
      ),
      [`json/figma/theme/${id}`]: createFigmaFormat(COLLECTIONS.theme, id),
    }),
    {}
  );
};
