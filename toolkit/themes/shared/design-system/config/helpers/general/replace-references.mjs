/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line import/no-unresolved
import { usesReferences, getReferences } from "style-dictionary/utils";

export const replaceReferences = (value, tokens) => {
  let updatedValue = value.toString();
  if (usesReferences(value)) {
    getReferences(value, tokens).forEach(reference => {
      updatedValue = updatedValue.replace(
        `{${reference.path.join(".")}}`,
        `var(--${reference.name.replace("-base", "")})`
      );
    });
  }
  return updatedValue;
};
