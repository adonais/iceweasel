/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { isComponentToken } from "./is-component-token.mjs";
import { shouldTransformBrowserThemeValue } from "./should-transform-browser-theme-value.mjs";

const getValueObject = root => {
  if (root.light) {
    return { light: root.light, dark: root.dark };
  }
  return { default: root.default };
};

export const getBrowserThemeValue = ({ surface, token, originalValue }) => {
  if (!shouldTransformBrowserThemeValue({ surface, token, originalValue })) {
    return originalValue;
  }

  if (surface && originalValue[surface]) {
    return {
      ...originalValue,
      [surface]: {
        default: originalValue.nativeTheme,
        browserTheme: getValueObject(originalValue.platform),
      },
    };
  }

  if (isComponentToken(token)) {
    return {
      default: originalValue.nativeTheme,
      browserTheme: getValueObject(originalValue),
    };
  }

  return {
    ...originalValue,
    platform: {
      default: originalValue.nativeTheme,
      browserTheme: getValueObject(originalValue),
    },
  };
};
