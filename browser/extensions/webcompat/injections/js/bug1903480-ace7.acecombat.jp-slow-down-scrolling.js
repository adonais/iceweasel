/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 1903480 - Ace Combat 7's site wheel-scrolls ridiculously quickly.
 *
 * The site is intentionally scaling the value of wheel event deltaY by 30
 * on Firefox. We can undo that here.
 */

/* globals exportFunction */

console.info(
  "wheel events are being scaled down for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=1903480 for details."
);

const proto = window.wrappedJSObject.WheelEvent.prototype;
const descriptor = Object.getOwnPropertyDescriptor(proto, "deltaY");
const { get } = descriptor;

descriptor.get = exportFunction(function () {
  const value = get.call(this);
  return value / 30;
}, window);

Object.defineProperty(proto, "deltaY", descriptor);
