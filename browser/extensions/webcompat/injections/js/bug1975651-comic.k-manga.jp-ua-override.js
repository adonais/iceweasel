/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 1975651 - User agent override for comic.k-manga.jp
 */

/* globals exportFunction, UAHelpers */

console.info(
  "The user agent and navigator.appVersion have been shimmed for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=1975651 for details."
);

UAHelpers.overrideWithDeviceAppropriateChromeUA();

const appVer = navigator.wrappedJSObject.userAgent.replace("Mozilla/", "");
const nav = Object.getPrototypeOf(navigator.wrappedJSObject);
const appVersion = Object.getOwnPropertyDescriptor(nav, "appVersion");
appVersion.get = exportFunction(() => appVer, window);
Object.defineProperty(nav, "appVersion", appVersion);
