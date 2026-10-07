/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

const STATUS_L10N_IDS = {
  watching: "ai-tasks-alert-status-watching",
  paused: "ai-tasks-alert-status-paused",
};

/**
 * Pill stating whether a monitor is currently watching or paused. Every surface
 * that lists monitors shows it, and each of those lives in its own shadow root,
 * so the pill is an element rather than a class they would each have to style.
 *
 * @property {"watching"|"paused"} kind - Which status to state. Reflected so
 *   the stylesheet can colour the pill. Anything else renders nothing.
 */
export class MonitorStatusChip extends MozLitElement {
  static properties = {
    kind: { type: String, reflect: true },
  };

  render() {
    const l10nId = STATUS_L10N_IDS[this.kind];
    // The stylesheet is rendered even with nothing to say, because it carries
    // the rule that keeps an empty pill from taking up room.
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/monitors-display.css"
      />
      ${l10nId ? html`<span data-l10n-id=${l10nId}></span>` : nothing}
    `;
  }
}

customElements.define("monitor-status-chip", MonitorStatusChip);
