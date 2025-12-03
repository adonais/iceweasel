/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals exportFunction */

"use strict";

/**
 * hexagame.io - Shows an alert recommending other browsers.
 * Bug #1898951 - https://bugzilla.mozilla.org/show_bug.cgi?id=1898951
 * WebCompat issue #120035 - https://webcompat.com/issues/120035
 */

console.info(
  "window.alert is being overriden for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=1898951 for details."
);

const originalAlert = window.wrappedJSObject.alert;
window.wrappedJSObject.alert = exportFunction(function (msg) {
  if (!msg?.toLowerCase?.().includes("chrome")) {
    originalAlert(msg);
  }
}, window);
