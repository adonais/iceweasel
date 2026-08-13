/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * For more information please see
 * https://w3c.github.io/webappsec-referrer-policy#idl-index
 */

// NOTE: Keep this in sync with the `enum ReferrerPolicy` in
// dom/base/speculationrules/lib.rs.
enum ReferrerPolicy {
  "",
  "no-referrer",
  "no-referrer-when-downgrade",
  "origin",
  "origin-when-cross-origin",
  "unsafe-url", "same-origin",
  "strict-origin",
  "strict-origin-when-cross-origin"
};
