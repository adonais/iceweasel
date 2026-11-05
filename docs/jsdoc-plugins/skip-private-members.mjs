/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// jsdoc handles private class members wrongly, causing errors in sphinx_js.
// Private members never appear in our docs, so we skip them.

export const handlers = {
  newDoclet({ doclet }) {
    let codeName = doclet.meta?.code?.name;
    if (
      // #methods in classes with @alias
      !doclet.longname ||
      // #field declarations
      doclet.meta?.code?.type == "ClassPrivateProperty" ||
      (typeof codeName == "string" &&
        // static #methods and assignments to this.#field
        (codeName.endsWith(".") ||
          // assignments to this.#field.member
          codeName.includes("..")))
    ) {
      doclet.undocumented = true;
    }
  },
};
