/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

module.exports = function ({ resource, nestedResourceUpdates }) {
  for (const { path, value } of nestedResourceUpdates) {
    if (
      path.length != 3 ||
      path[0] != "atRules" ||
      typeof path[1] != "number" ||
      path[2] != "matches"
    ) {
      // The path should be something like this:
      // ["atRules", 0, "matches"]
      // where 0 is the index of the object contained in 'atRules' array
      // whose 'matches' attribute should be updated with the new 'value'.
      throw new Error(
        "Unexpected nested resource updates for stylesheet. path: " + path
      );
    }
    const index = path[1];
    if (!resource.atRules[index]) {
      throw new Error(
        "Missing at rule for nested ressource updates at index: " + index
      );
    }
    resource.atRules[index].matches = value;
  }
};
