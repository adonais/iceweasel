/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 1959598 - new products do not load in while scrolling at certain zoom values
 *
 * The page's logic seems to rely on integer values being returned by window.pageYOffset.
 */

/* globals exportFunction */

const win = window.wrappedJSObject;
const pyo = Object.getOwnPropertyDescriptor(win, "pageYOffset");
const pyoGet = pyo.get;
pyo.get = exportFunction(function () {
  return Math.round(pyoGet.call(this));
}, window);
Object.defineProperty(win, "pageYOffset", pyo);
