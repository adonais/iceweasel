/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 1928941 - UA spoof for oasis.decart.ai
 * Bug 1987351 - UA spoof for mirage.decart.ai
 *
 * These sites are checking for window.chrome, so let's spoof that.
 */

/* globals exportFunction */

const bug = location.origin.includes("mirage.decart.ai") ? 1987351 : 1928941;
console.info(
  `window.chrome has been shimmed for compatibility reasons. https://bugzilla.mozilla.org/show_bug.cgi?id=${bug} for details.`
);

window.wrappedJSObject.chrome = new window.wrappedJSObject.Object();
