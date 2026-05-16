/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 2018543 - UA spoof for lacunacoil.com
 *
 * The site uses text/plain script types, which has a weird interaction with
 * wp-rocket on Firefox, causing them to not be run. We can work around this
 * by removing the text/plain type from scripts as their src is being set.
 */

{
  const { prototype } = HTMLScriptElement;
  const desc = Object.getOwnPropertyDescriptor(prototype, "src");
  const origSet = desc.set;
  desc.set = function (url) {
    if (this.getAttribute("type") == "text/plain") {
      this.removeAttribute("type");
      console.info(
        "removing text/plain type from script for compatibility reasons. See https://bugzil.la/2018543 for details."
      );
    }
    return origSet.call(this, url);
  };
  Object.defineProperty(prototype, "src", desc);
}
