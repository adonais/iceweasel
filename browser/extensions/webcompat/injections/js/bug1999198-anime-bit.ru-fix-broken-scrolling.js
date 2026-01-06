/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 1999198 - Fix broken scrolling on anime-bit.ru
 *
 * The site uses quirks mode, and due to a related interop issue their page
 * will not load more content as the page is scrolled down. This fixes it.
 */

/* globals exportFunction */

console.info(
  "documentElement.clientHeight has been overridden for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=1999198 for details."
);

const proto = Element.prototype.wrappedJSObject;
const clientHeightDesc = Object.getOwnPropertyDescriptor(proto, "clientHeight");
const origHeight = clientHeightDesc.get;
clientHeightDesc.get = exportFunction(function () {
  if (this === document.documentElement) {
    return this.scrollHeight;
  }
  return origHeight.call(this);
}, window);
Object.defineProperty(proto, "clientHeight", clientHeightDesc);
