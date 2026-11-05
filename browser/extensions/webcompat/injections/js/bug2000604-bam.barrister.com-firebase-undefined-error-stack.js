/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 2000604 - bam.barrister.com/techportal shows a blank page.
 *
 * The site's Flutter app (FlutterFire firebase_core_web) calls
 * self.firebase_core.getApps() before the Firebase JS SDK is loaded, and
 * only treats the resulting TypeError as "SDK not loaded yet" if the error
 * string or its stack contains "of undefined" (V8's "Cannot read properties
 * of undefined" wording). SpiderMonkey words the message differently and its
 * stack has no message line, so the error is rethrown and the app never
 * boots. We prepend a V8-like message line to the stack of such TypeErrors.
 */

if (
  (function () {
    try {
      self[new Date()].nonexistent;
      return true;
    } catch (e) {
      return !e.stack.includes("Cannot read properties of undefined");
    }
  })()
) {
  const desc = Object.getOwnPropertyDescriptor(Error.prototype, "stack");
  if (desc?.get) {
    const origGet = desc.get;
    const isUndefinedRE = /\bis undefined$/;
    desc.get = function () {
      const stack = origGet.call(this);
      try {
        if (
          this instanceof TypeError &&
          typeof stack === "string" &&
          isUndefinedRE.test(this.message)
        ) {
          return `TypeError: Cannot read properties of undefined (${this.message})\n${stack}`;
        }
      } catch (_) {}
      return stack;
    };
    // eslint-disable-next-line no-extend-native
    Object.defineProperty(Error.prototype, "stack", desc);

    console.info(
      "Error.prototype.stack has been altered for compatibility reasons. See https://bugzil.la/2000604 for details."
    );
  }
}
