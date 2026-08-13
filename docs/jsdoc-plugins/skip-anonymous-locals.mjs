/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Any doc comment (even a @type) on a function-local makes jsdoc emit an
// `<anonymous>~name` doclet. Same-named locals in different functions clash,
// aborting the build (sphinx_js PathsTaken). We never document locals like
// this, so they don't reach our docs and are thus safe to skip.

export const handlers = {
  newDoclet({ doclet }) {
    if (
      doclet.scope === "inner" &&
      doclet.memberof?.endsWith("<anonymous>") &&
      (doclet.kind === "member" || doclet.kind === "constant")
    ) {
      doclet.undocumented = true;
    }
  },
};
