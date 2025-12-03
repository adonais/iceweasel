/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals exportFunction */

/**
 * Bug 1993517 - onlinebank.resursbank.se - extra browser tabs for bankid logins remain open
 *
 * We can open the external app link in the same tab rather than a _blank tab.
 * Chrome and Safari seem to autoclose such tabs incorrectly.
 */

console.info(
  'Dropping target="_blank" attribute for bankid logins for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=1993517 for details.'
);

if (/Win32|Win64|Windows|WinCE/i.test(navigator.platform)) {
  const nav = Object.getPrototypeOf(navigator.wrappedJSObject);
  const platform = Object.getOwnPropertyDescriptor(nav, "platform");
  platform.get = exportFunction(() => "MacIntel", window);
  Object.defineProperty(nav, "platform", platform);
}

document.addEventListener(
  "click",
  e => e.target?.closest("a[href^='bankid://']")?.removeAttribute("target"),
  true
);
