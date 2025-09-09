/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals exportFunction */

"use strict";

/**
 * www.acionafacil.com.br - Shows an alert recommending Chrome.
 * Bug #1902416 - https://bugzilla.mozilla.org/show_bug.cgi?id=1902416
 *
 * We can intercept the call to alert and hide it.
 */

console.info(
  "window.alert is being overriden for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=1902416 for details."
);

const originalAlert = window.wrappedJSObject.alert;
window.wrappedJSObject.alert = exportFunction(function (msg) {
  if (!msg?.toLowerCase?.().includes("google chrome")) {
    originalAlert(msg);
  }
}, window);
