/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 1898929 - UA spoof for app.sessionlinkpro.com
 *
 * This site is checking for Chrome in navigator.userAgent and for window.chrome, so let's spoof those.
 */

/* globals exportFunction, UAHelpers */

console.info(
  "navigator.userAgent and window.chrome are being shimmed for compatibility reasons. https://bugzilla.mozilla.org/show_bug.cgi?id=1898929 for details."
);

window.wrappedJSObject.chrome = new window.wrappedJSObject.Object();

const CHROME_UA = UAHelpers.addChrome();
const nav = Object.getPrototypeOf(navigator.wrappedJSObject);
const ua = Object.getOwnPropertyDescriptor(nav, "userAgent");
ua.get = exportFunction(() => CHROME_UA, window);
Object.defineProperty(nav, "userAgent", ua);
