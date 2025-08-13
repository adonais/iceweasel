/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 1898934 - UA spoof for tza.red
 *
 * This site is checking for window.chrome, so let's spoof that.
 */

/* globals exportFunction */

console.info(
  "window.chrome is being shimmed for compatibility reasons. https://bugzilla.mozilla.org/show_bug.cgi?id=1898934 for details."
);

window.wrappedJSObject.chrome = new window.wrappedJSObject.Object();
