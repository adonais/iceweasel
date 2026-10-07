/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * Private-browsing "kit" intro on the fox mask; animates when `play` is set.
 */
export default class PrivateBrowsingMaskIntro extends MozLitElement {
  static properties = {
    play: { type: Boolean },
  };

  constructor() {
    super();
    this.play = false;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/private-browsing-mask-intro.css"
      />
      <div class="circle ${this.play ? "playing" : ""}">
        <div class="kit"></div>
        <div class="mask"></div>
      </div>
    `;
  }
}

customElements.define("private-browsing-mask-intro", PrivateBrowsingMaskIntro);
