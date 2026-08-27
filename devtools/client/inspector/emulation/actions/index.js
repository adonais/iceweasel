/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { createEnum } = require("resource://devtools/client/shared/enum.js");

createEnum(
  [
    // Set the color scheme emulation
    "SET_COLOR_SCHEME_EMULATION",

    // Set the print emulation state
    "SET_PRINT_EMULATION_ENABLED",

    // Set the reduced motion emulation
    "SET_REDUCED_MOTION_EMULATION",
  ],
  module.exports
);
