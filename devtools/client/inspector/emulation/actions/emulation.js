/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  SET_COLOR_SCHEME_EMULATION,
  SET_PRINT_EMULATION_ENABLED,
  SET_REDUCED_MOTION_EMULATION,
} = require("resource://devtools/client/inspector/emulation/actions/index.js");

module.exports = {
  setColorSchemeEmulation(colorScheme) {
    return {
      type: SET_COLOR_SCHEME_EMULATION,
      colorScheme,
    };
  },

  setPrintEmulationEnabled(enabled) {
    return {
      type: SET_PRINT_EMULATION_ENABLED,
      enabled,
    };
  },

  setReducedMotionEmulation(reducedMotion) {
    return {
      type: SET_REDUCED_MOTION_EMULATION,
      reducedMotion,
    };
  },
};
