/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Keeps inline `@type` hints, e.g. `@type {HTMLElement}` next to `(foo.bar)`,
 * from being incorrectly documented as members, which fails the build.
 */

export const handlers = {
  newDoclet({ doclet }) {
    if (
      doclet.kind === "member" &&
      doclet.meta?.code?.type === "MemberExpression" &&
      doclet.meta.code.value === undefined
    ) {
      doclet.undocumented = true;
    }
  },
};
