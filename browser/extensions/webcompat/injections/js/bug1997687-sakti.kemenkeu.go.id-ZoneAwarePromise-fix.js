/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * sakti.kemenkeu.go.id - page never loads
 *
 * The page has a race condition while loading where it redefines window.Promise
 * before Zone.js loads, triggering a ZoneAwarePromise exception while loading.
 * We can prevent this exception from being thrown so the page loads.
 */

/* globals cloneInto, exportFunction */

console.info(
  "Zone.assertZonePatched has been overridden for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=1997687 for details."
);

let Zone;
const no_op = exportFunction(() => {}, window);

const proxyConfig = cloneInto(
  {
    get(_, prop) {
      if (prop === "assertZonePatched") {
        return no_op;
      }
      return window.wrappedJSObject.Reflect.get(...arguments);
    },
  },
  window,
  { cloneFunctions: true }
);

Object.defineProperty(window.wrappedJSObject, "Zone", {
  configurable: true,

  get: exportFunction(function () {
    return Zone;
  }, window),

  set: exportFunction(function (value = {}) {
    Zone = new window.wrappedJSObject.Proxy(value, proxyConfig);
  }, window),
});
