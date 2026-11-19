/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
// eslint-disable-next-line import-x/no-unassigned-import
import "chrome://browser/content/widgets/moz-widget-header.mjs";

const WIDGET_SANDBOX =
  "allow-forms allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox";
const FRAME_SLOT = "frame";

/**
 * Hosts a self-contained, interactive widget for brief interactions.
 *
 * It clips embedded content to the bounds set by the `size` attribute.
 *
 * If `src` is set, the widget content is loaded in a `<browser>` child in chrome documents and an `<iframe>` in content documents.
 * Otherwise the default slot is used.
 *
 * @property {string} widgetId - The widget's registered ID.
 * @property {string} title - The widget's accessible name, taken off the host element.
 * @property {string} size - `small`, `medium`, or `large`. Defaults to `large`.
 * @property {boolean} padded - Insets the header and content.
 * @property {string} menuLabel - The accessible name of the menu button drawn without a header. Defaults to "More options".
 * @property {string} src - A widget document URL.
 * @property {string} remoteType - The remote type a `<browser>` frame loads in.
 * @property {number} browsingContextGroupId - The browsing context group a `<browser>` frame's initial load joins.
 * @slot header - A `moz-widget-header` shown above the content.
 * @slot menu - A `panel-list`, opened by the header's menu button, or by a menu button over the content without a header.
 * @slot default - Widget content used when `src` is not set.
 */
export class MozWidget extends MozLitElement {
  static properties = {
    widgetId: { attribute: "widget-id" },
    title: { type: String, fluent: true, mapped: true },
    remoteType: { attribute: "remote-type" },
    browsingContextGroupId: { type: Number, attribute: "group-id" },
    size: { reflect: true },
    padded: { type: Boolean, reflect: true },
    menuLabel: { type: String, attribute: "menu-label", fluent: true },
    src: { reflect: true },
    _menuId: { state: true },
    _hasHeader: { state: true },
  };

  /** @type {MozBrowser|null} The `<browser>` frame if used. */
  #browser = null;

  constructor() {
    super();
    this.widgetId = null;
    this.title = null;
    this.size = null;
    this.padded = false;
    this.menuLabel = null;
    this.src = null;
    this.remoteType = null;
    this.browsingContextGroupId = null;
    this._menuId = null;
    this._hasHeader = false;
  }

  /**
   * The current frame.
   *
   * @returns {HTMLIFrameElement|MozBrowser|null}
   */
  get frame() {
    if (!this.src) {
      return null;
    }
    if (this.#browser) {
      return this.#browser;
    }
    return this.renderRoot?.querySelector("iframe");
  }

  /**
   * Whether the containing document is a chrome document.
   *
   * @returns {boolean}
   */
  get supportsXULElements() {
    return !!this.ownerDocument.createXULElement;
  }

  willUpdate(changes) {
    super.willUpdate(changes);
    if (!this.hasUpdated) {
      this.#setMenu(this.querySelector(':scope > [slot="menu"]'));
    }
    if (!this.hasUpdated || changes.has("_menuId")) {
      this.#updateHeader();
    }
    if (!this.src) {
      this.#setBrowser(null);
      return;
    }
    if (this.supportsXULElements) {
      this.#updateBrowser(changes);
    }
  }

  #onMenuSlotChange(event) {
    this.#setMenu(event.target.assignedElements()[0]);
  }

  #setMenu(menu) {
    if (menu) {
      menu.id ||= `moz-widget-menu-${crypto.randomUUID()}`;
    }
    this._menuId = menu?.id || null;
  }

  #updateHeader() {
    const header = this.querySelector(':scope > [slot="header"]');
    if (header) {
      header.menuId = this._menuId;
    }
    this._hasHeader = !!header;
  }

  #updateBrowser(changes) {
    if (!this.src || !this.supportsXULElements) {
      this.#setBrowser(null);
      return;
    }
    if (
      !this.#browser ||
      changes.has("remoteType") ||
      changes.has("browsingContextGroupId")
    ) {
      this.#setBrowser(this.#renderBrowser());
    } else if (this.#browser.getAttribute("src") != this.src) {
      this.#browser.setAttribute("src", this.src);
    }
  }

  #setBrowser(browser) {
    this.#browser?.remove();
    this.#browser = browser;
    if (browser) {
      this.append(browser);
    }
  }

  #renderBrowser() {
    const browser = this.ownerDocument.createXULElement("browser");
    browser.setAttribute("slot", FRAME_SLOT);
    browser.setAttribute("type", "content");
    browser.setAttribute("disableglobalhistory", "true");
    browser.setAttribute("maychangeremoteness", "true");
    browser.setAttribute("remote", "true");
    if (this.remoteType) {
      browser.setAttribute("remoteType", this.remoteType);
    }
    if (this.remoteType == "extension") {
      // Bug 2074276 will add a webextension-view-type for widgets; until then
      // extension APIs see the widget document as a tab view.
      browser.setAttribute("messagemanagergroup", "webext-browsers");
    }
    const groupId = this.browsingContextGroupId;
    if (Number.isSafeInteger(groupId) && groupId > 0) {
      browser.setAttribute("initialBrowsingContextGroupId", groupId);
    }
    browser.setAttribute("src", this.src);
    return browser;
  }

  #renderContent() {
    if (!this.src) {
      return html`<slot></slot>`;
    }
    if (this.#browser) {
      return html`<slot name=${FRAME_SLOT}></slot>`;
    }
    return html`<iframe
      src=${this.src}
      sandbox=${WIDGET_SANDBOX}
      title=${this.title ?? nothing}
    ></iframe>`;
  }

  #renderMenuButton() {
    return html`<moz-button
      id="menu-button"
      type="ghost"
      size="small"
      iconsrc="chrome://global/skin/icons/more.svg"
      .menuId=${this._menuId}
      data-l10n-id=${this.menuLabel ? nothing : "moz-button-more-options"}
      .ariaLabel=${this.menuLabel}
      .title=${this.menuLabel}
    ></moz-button>`;
  }

  render() {
    const usesIframe = this.src && !this.#browser;
    const label = this.title && !usesIframe ? this.title : nothing;
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/widgets/moz-widget.css"
      />
      <article class="widget" aria-label=${label}>
        <slot name="header" @slotchange=${this.#updateHeader}></slot>
        ${this._menuId && !this._hasHeader ? this.#renderMenuButton() : nothing}
        <div class="widget-content">${this.#renderContent()}</div>
        <slot name="menu" @slotchange=${this.#onMenuSlotChange}></slot>
      </article>
    `;
  }
}

customElements.define("moz-widget", MozWidget);
