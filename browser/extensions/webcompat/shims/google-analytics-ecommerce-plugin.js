/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 1620533 - Shim Google Analytics' e-commerce plugin
 *
 * Sites which load the e-commerce plugin (ec.js) expect it to register
 * itself as window.gaplugins.EC, and may break when the script is blocked
 * by ETP. This shim provides a stub so that such pages keep working.
 */

if (!window.gaplugins) {
  window.gaplugins = {};
}

if (!window.gaplugins.EC) {
  window.gaplugins.EC = () => {};
}
