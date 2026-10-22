/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { MozPageNav, MozPageNavButton } from "./moz-page-nav.mjs";

declare global {
  interface HTMLElementTagNameMap {
    "moz-page-nav": MozPageNav;
    "moz-page-nav-button": MozPageNavButton;
  }
}
