/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Bug 1960823 - Shim navigator.platform on dvcreservations.com
 *
 * This page adds niceScroll on Android, which breaks scrolling and
 * zooming on Firefox. Adding ` iphone` to `navigator.platform` makes
 * the page avoid adding niceScroll entirely, unbreaking the page.
 */

/* globals exportFunction */

console.info(
  "The navigator.platform property has been shimmed to include 'iphone' for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=1960823 for details."
);

const newPlat = navigator.platform + " iphone";
const nav = Object.getPrototypeOf(navigator.wrappedJSObject);
const platform = Object.getOwnPropertyDescriptor(nav, "platform");
platform.get = exportFunction(() => newPlat, window);
Object.defineProperty(nav, "platform", platform);
