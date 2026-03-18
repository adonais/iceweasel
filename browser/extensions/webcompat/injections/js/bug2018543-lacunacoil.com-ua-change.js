/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 2018543 - UA spoof for lacunacoil.com
 *
 * The site does things for Firefox specifically which break their buttons,
 * so we change the useragent string to Fire_fox, which avoids the issues.
 */

if (navigator.userAgent.includes("Firefox")) {
  console.info(
    "navigator.userAgent is being shimmed for compatibility reasons. See https://bugzil.la/2018543 for details."
  );

  const nav = Object.getPrototypeOf(navigator);
  const ua = Object.getOwnPropertyDescriptor(nav, "userAgent");
  ua.get = () => navigator.userAgent.replace("Firefox", "Fire_fox");
  Object.defineProperty(nav, "userAgent", ua);
}
