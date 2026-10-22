/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { MozToggle } from "./moz-toggle.mjs";

declare global {
  interface HTMLElementTagNameMap {
    "moz-toggle": MozToggle;
  }
}
