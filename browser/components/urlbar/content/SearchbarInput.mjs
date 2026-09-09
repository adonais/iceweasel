/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { UrlbarInputBase } from "chrome://browser/content/urlbar/UrlbarInputBase.mjs";

/**
 * The search bar input, backing the `moz-searchbar` custom element.
 */
export class SearchbarInput extends UrlbarInputBase {}

customElements.define("moz-searchbar", SearchbarInput);
