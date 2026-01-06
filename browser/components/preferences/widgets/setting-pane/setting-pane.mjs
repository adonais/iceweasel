/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

/**
 * @typedef {object} SettingPaneConfig
 * @property {string} [parent] The pane that links to this one.
 * @property {string} l10nId Fluent id for the heading/description.
 * @property {string[]} groupIds What setting groups should be rendered.
 */

export class SettingPane extends MozLitElement {
  static properties = {
    name: { type: String },
    isSubPane: { type: Boolean },
    config: { type: Object },
  };

  static queries = {
    pageHeaderEl: "moz-page-header",
  };

  constructor() {
    super();
    /** @type {string} */
    this.name = undefined;
    /** @type {boolean} */
    this.isSubPane = false;
    /** @type {SettingPaneConfig} */
    this.config = undefined;
  }

  createRenderRoot() {
    return this;
  }

  async getUpdateComplete() {
    let result = await super.getUpdateComplete();
    // @ts-ignore bug 1997478
    await this.pageHeaderEl.updateComplete;
    return result;
  }

  goBack() {
    window.gotoPref(this.config.parent);
  }

  connectedCallback() {
    super.connectedCallback();
    this.setAttribute("data-category", this.name);
    this.hidden = true;
    if (this.isSubPane) {
      this.setAttribute("data-hidden-from-search", "true");
      this.setAttribute("data-subpanel", "true");
    }
    this._createCategoryButton();
  }

  init() {
    if (!this.hasUpdated) {
      this.performUpdate();
    }
    for (let groupId of this.config.groupIds) {
      window.initSettingGroup(groupId);
    }
  }

  _createCategoryButton() {
    let categoryButton = document.createXULElement("richlistitem");
    categoryButton.classList.add("category");
    if (this.isSubPane) {
      categoryButton.classList.add("hidden-category");
    }
    categoryButton.setAttribute("value", this.name);
    document.getElementById("categories").append(categoryButton);
  }

  /** @param {string} groupId */
  groupTemplate(groupId) {
    return html`<setting-group groupid=${groupId}></setting-group>`;
  }

  render() {
    return html`
      <moz-page-header
        data-l10n-id=${this.config.l10nId}
        .backButton=${this.isSubPane}
        @navigate-back=${this.goBack}
      ></moz-page-header>
      ${this.config.groupIds.map(groupId => this.groupTemplate(groupId))}
    `;
  }
}
customElements.define("setting-pane", SettingPane);
