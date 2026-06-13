/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { isDiscoverEnabled } from "../aboutaddons-utils.mjs";
import { CategoryButton } from "./category-button.mjs";

class DiscoverButton extends CategoryButton {
  get isVisible() {
    return isDiscoverEnabled();
  }
}
customElements.define("discover-button", DiscoverButton, { extends: "button" });
