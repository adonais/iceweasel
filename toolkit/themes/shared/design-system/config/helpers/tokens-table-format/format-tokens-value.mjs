/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { OVERRIDE_IDENTIFIERS } from "../general/override-identifiers.mjs";

export const formatTokenValue = ({ value }) => {
  if (typeof value === "string" || typeof value === "number") {
    return value.toString();
  }

  OVERRIDE_IDENTIFIERS.forEach(({ id }) => {
    if (value[id]) {
      delete value[id];
    }
  });

  const formattedValue = { ...value };
  if (value.light && value.dark) {
    formattedValue.default = `light-dark(${value.light}, ${value.dark})`;
  }

  if (value.brand) {
    formattedValue.brand = formatTokenValue({ value: value.brand });
  }

  if (value.platform) {
    formattedValue.platform = formatTokenValue({ value: value.platform });
  }

  if (value.nativeTheme) {
    formattedValue.platform = {
      default: value.nativeTheme,
      browserTheme: value.platform
        ? formatTokenValue({ value: value.platform })
        : formatTokenValue({
            value: {
              light: value.light ?? undefined,
              dark: value.dark ?? undefined,
              default: value.default ?? undefined,
            },
          }),
    };
  }

  return formattedValue;
};
