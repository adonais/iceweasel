/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/sidebar/sidebar-panel-header.mjs";

export class PageAssist extends MozLitElement {
  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
  }

  // TODO: Make sure sidebar-panel-header is styled correctly to look uniform across sidebar tools.
  render() {
    return html`
      <div>
        <sidebar-panel-header
          data-l10n-id="genai-page-assist-sidebar-title"
          data-l10n-attrs="heading"
          view="viewGenaiPageAssistSidebar"
        ></sidebar-panel-header>
      </div>
    `;
  }
}

customElements.define("page-assist", PageAssist);
