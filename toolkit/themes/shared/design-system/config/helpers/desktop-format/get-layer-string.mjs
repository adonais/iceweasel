/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { OVERRIDE_IDENTIFIERS } from "../general/override-identifiers.mjs";

export const getLayerString = () => {
  const themeLayers = [
    "tokens-foundation",
    "tokens-browser-theme",
    "tokens-foundation-brand",
  ];

  const accessibilityLayers = [
    "tokens-prefers-contrast",
    "tokens-forced-colors",
  ];

  const themeLayersWithOverrides = [
    ...themeLayers,
    ...OVERRIDE_IDENTIFIERS.flatMap(({ id }) =>
      themeLayers.map(layer => `${layer}-${id}`)
    ),
  ];

  const accessibilityLayersWithOverrides = accessibilityLayers.flatMap(
    layer => [layer, ...OVERRIDE_IDENTIFIERS.map(({ id }) => `${layer}-${id}`)]
  );

  const layers = [
    ...themeLayersWithOverrides,
    ...accessibilityLayersWithOverrides,
  ];

  return `@layer ${layers.join(", ")};\n\n`;
};
