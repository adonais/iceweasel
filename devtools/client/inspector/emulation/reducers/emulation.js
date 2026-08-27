/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  SET_COLOR_SCHEME_EMULATION,
  SET_PRINT_EMULATION_ENABLED,
  SET_REDUCED_MOTION_EMULATION,
} = require("resource://devtools/client/inspector/emulation/actions/index.js");

const INITIAL_EMULATION_STATE = {
  colorSchemeEmulation: null,
  printEmulationEnabled: false,
  reducedMotionEmulation: null,
};

function emulation(state = INITIAL_EMULATION_STATE, action) {
  switch (action.type) {
    case SET_COLOR_SCHEME_EMULATION:
      return {
        ...state,
        colorSchemeEmulation: action.colorScheme,
      };

    case SET_PRINT_EMULATION_ENABLED:
      return {
        ...state,
        printEmulationEnabled: action.printEmulationEnabled,
      };

    case SET_REDUCED_MOTION_EMULATION:
      return {
        ...state,
        reducedMotionEmulation: action.enabled,
      };

    default:
      return state;
  }
}

module.exports = emulation;
