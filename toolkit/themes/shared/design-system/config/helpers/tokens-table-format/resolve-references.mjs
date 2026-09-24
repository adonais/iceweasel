/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { replaceReferences } from "../general/replace-references.mjs";

export const resolveReferences = (original, tokens) => {
  const resolvedValues = {};
  Object.entries(original).forEach(([key, value]) => {
    if (typeof value === "object" && value != null) {
      resolvedValues[key] = resolveReferences(value, tokens);
    } else {
      let resolvedVal = replaceReferences(value, tokens);
      resolvedValues[key] = resolvedVal;
    }
  });
  return resolvedValues;
};
