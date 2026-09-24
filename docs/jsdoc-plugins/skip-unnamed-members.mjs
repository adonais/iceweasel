/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// jsdoc cannot name a `#`-private class member. A doc comment on a declaration
// yields a doclet with an empty longname, and one on an assignment yields a
// doclet named after the enclosing class, which collides with the class itself
// in sphinx_js's lookup and aborts the build. Private members don't reach our
// docs, so both are safe to skip.

export const handlers = {
  newDoclet({ doclet }) {
    let codeName = doclet.meta?.code?.name;
    if (
      !doclet.longname ||
      (typeof codeName == "string" && codeName.endsWith("."))
    ) {
      doclet.undocumented = true;
    }
  },
};
