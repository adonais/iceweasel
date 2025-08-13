/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

// Test whether getCSSVariables function of utils.js works correctly or not.

const {
  getCSSVariables,
} = require("resource://devtools/client/inspector/rules/utils/utils.js");

add_task(() => {
  info("Normal usage");
  Assert.deepEqual(
    getCSSVariables("var(--color)"),
    ["--color"],
    "Found --color variable in var(--color)"
  );

  info("Variable with fallback");
  Assert.deepEqual(
    getCSSVariables("var(--color, red)"),
    ["--color"],
    "Found --color variable in var(--color)"
  );

  info("Nested variables");
  Assert.deepEqual(
    getCSSVariables("var(--color1, var(--color2, blue))"),
    ["--color1", "--color2"],
    "Found --color1 and --color2 variables in var(--color1, var(--color2, blue))"
  );

  info("Invalid variable");
  Assert.deepEqual(
    getCSSVariables("--color", "--color"),
    [],
    "Did not find variables in --color"
  );

  info("Variable with whitespace");
  Assert.deepEqual(
    getCSSVariables("var( --color )", "--color"),
    ["--color"],
    "Found --color variable in var( --color )"
  );
});
