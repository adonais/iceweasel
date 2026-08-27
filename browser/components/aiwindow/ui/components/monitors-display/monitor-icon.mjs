/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * Small badge showing the monitor watch icon in a violet square.
 *
 * @property {"large"|"small"} size - Icon size. "large" (default) or "small"
 *   (about 5px smaller). Reflected so CSS can target it via :host([size]).
 */
export class MonitorIcon extends MozLitElement {
  static properties = {
    size: { type: String, reflect: true },
  };

  constructor() {
    super();
    this.size = "large";
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/monitors-display.css"
      />

      <div class="icon-container" aria-hidden="true">
        <span class="icon"></span>
      </div>
    `;
  }
}

customElements.define("monitor-icon", MonitorIcon);
