/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * catalog.archives.gov - photos are displayed in reverse order
 * Bug #2020644 - https://bugzilla.mozilla.org/show_bug.cgi?id=2020644
 * WebCompat issue #210297 - https://webcompat.com/issues/210297
 *
 * The site calls Array.sort(() => 1), which is a strange choice, and leads to
 * unspecified browser behavior. Firefox sorts in one way, other browsers do not.
 * We can simply ignore that parameter to work around the issue.
 */

{
  console.info(
    "Array sorting behavior has been altered. See https://bugzil.la/2020644 for details."
  );

  const { prototype } = Array;
  const oldSort = prototype.sort;
  prototype.sort = function () {
    if (
      typeof arguments[0] == "function" &&
      String(arguments[0]).includes(".objectType)?-1:1")
    ) {
      return oldSort.call(this);
    }
    return oldSort.apply(this, arguments);
  };
}
