/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals exportFunction */

"use strict";

/**
 * www.jamsune.com - Shows an alert recommending other browsers.
 * Bug #1902419 - https://bugzilla.mozilla.org/show_bug.cgi?id=1902419
 */

console.info(
  "window.alert is being overriden for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=1902419 for details."
);

const originalAlert = window.wrappedJSObject.alert;
window.wrappedJSObject.alert = exportFunction(function (msg) {
  if (!msg?.toLowerCase?.().includes("크롬")) {
    originalAlert(msg);
  }
}, window);
