/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { getScreenshotUrlForAddon } from "../aboutaddons-utils.mjs";

export class ThemePreview extends MozLitElement {
  static properties = {
    addon: { type: Object },
  };

  createRenderRoot() {
    return this;
  }

  render() {
    const screenshotUrl =
      this.addon?.type === "theme"
        ? getScreenshotUrlForAddon(this.addon)
        : null;
    if (!screenshotUrl) {
      return nothing;
    }
    return html`<img
      class="card-heading-image"
      role="presentation"
      src=${screenshotUrl}
    />`;
  }
}
customElements.define("theme-preview", ThemePreview);
