/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  classMap,
  html,
  ifDefined,
  nothing,
  repeat,
  styleMap,
} from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/panel-list.mjs";

/**
 * A generic panel list component for displaying grouped items in a popup.
 *
 * This component is agnostic to the data it displays - consumers control
 * all logic including filtering, truncation, and special item handling.
 *
 * @typedef {{id: string, label: string, icon?: string, l10nId?: string, description?: string, descriptionL10nId?: string}} ListItem
 * @typedef {{items: ListItem[], headerL10nId?: string, header?: string}} ItemGroup
 * @property {ItemGroup[]} groups - Grouped list items to display
 * @property {string} placeholderL10nId - Fluent ID for empty state message
 * @property {object} anchor - Positioning anchor {left, top, width, height}
 */
export class SmartwindowPanelList extends MozLitElement {
  static shadowRootOptions = {
    ...MozLitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  static properties = {
    groups: { type: Array },
    anchor: { type: Object },
    placeholderL10nId: { type: String },
    alwaysOpen: { type: Boolean },
    sidebarMode: { type: Boolean, reflect: true },
    selectedItemId: { type: String },
  };

  #panelList = null;
  #anchorElement = null;

  constructor() {
    super();
    this.groups = [];
    this.anchor = null;
    this.placeholderL10nId = "";
    this.alwaysOpen = false;
    this.sidebarMode = false;
    this.selectedItemId = null;
  }

  willUpdate(changedProperties) {
    // Reset the active selection to the first item
    // so there is always a highlighted default.
    if (changedProperties.has("groups")) {
      const [first] = this.#selectableItems();
      const firstId = first?.id ?? null;
      if (this.selectedItemId !== firstId) {
        this.selectedItemId = firstId;
      }
    }
  }

  #selectableItems() {
    return this.groups.flatMap(group => group.items ?? []);
  }

  /**
   * Moves the active selection
   *
   * @param {number} delta
   */
  moveSelection(delta) {
    const items = this.#selectableItems();
    if (!items.length) {
      return;
    }
    const current = items.findIndex(item => item.id === this.selectedItemId);
    const start = current === -1 ? 0 : current;
    const next = (start + delta + items.length) % items.length;
    this.selectedItemId = items[next].id;
  }

  /**
   * @returns {object|null} The currently selected item
   */
  getSelectedItem() {
    return (
      this.#selectableItems().find(item => item.id === this.selectedItemId) ??
      null
    );
  }

  get #hasCustomItems() {
    const itemsHost = this.#panelList ?? this;
    return [...itemsHost.children].some(
      element =>
        element.localName !== "panel-item" &&
        !element.classList.contains("panel-item-container")
    );
  }

  get #isCommandMode() {
    return this.getAttribute("data-triggered-by") === "inline-command";
  }

  firstUpdated() {
    this.#panelList = this.shadowRoot.querySelector("panel-list");
    this.#panelList.addEventListener("shown", () => {
      // The command palette sizes/positions to the smartbar and
      // should recompute as soon as it opens
      if (this.#isCommandMode) {
        this.#reposition();
      } else if (this.sidebarMode) {
        this.#clampToViewport();
      }
    });
    // Consumers may pass their own items as child elements.
    this.#maybeMoveChildrenIntoPanel();
    if (this.alwaysOpen) {
      this.show();
    }
  }

  #maybeMoveChildrenIntoPanel() {
    const custom = Array.from(this.children);
    if (!custom.length) {
      return;
    }
    this.#panelList.append(...custom);
  }

  #clampToViewport() {
    const panelEl = this.#panelList;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelRect = panelEl.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(panelEl).marginInlineStart) || 0;
    const effectiveWidth = Math.min(
      panelRect.width,
      viewportWidth - 2 * margin
    );
    const effectiveHeight = Math.min(panelRect.height, viewportHeight);

    let x = parseFloat(panelEl.style.left) || 0;
    let y = parseFloat(panelEl.style.top) || 0;
    x = Math.max(0, Math.min(x, viewportWidth - effectiveWidth - 2 * margin));
    y = Math.max(0, Math.min(y, viewportHeight - effectiveHeight));
    panelEl.style.left = `${x}px`;
    panelEl.style.top = `${y}px`;
  }

  #reposition() {
    requestAnimationFrame(() => {
      const anchorElement = this.#anchorElement;
      if (!anchorElement || !this.#panelList?.open) {
        return;
      }
      const panelEl = this.#panelList;
      const anchorRect = anchorElement.getBoundingClientRect();
      const panelHeight = panelEl.scrollHeight;
      const valign = panelEl.getAttribute("valign");
      const VIEWPORT_PANEL_MIN_MARGIN = 10;
      let topOffset;
      if (valign === "top") {
        topOffset = Math.max(
          anchorRect.top - panelHeight,
          VIEWPORT_PANEL_MIN_MARGIN
        );
      } else {
        topOffset = anchorRect.bottom;
      }
      // Command mode spans the full width of its anchor (the smartbar) and
      // left-aligns to it
      if (this.#isCommandMode) {
        panelEl.style.width = `${anchorRect.width}px`;
        panelEl.style.left = `${anchorRect.left + window.scrollX}px`;
      } else {
        panelEl.style.width = "";
      }
      panelEl.style.top = `${topOffset + window.scrollY}px`;
      this.#clampToViewport();
    });
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has("anchor")) {
      // If anchor is an element use it directly,
      // otherwise we can use the positioned span.
      this.#anchorElement =
        this.anchor instanceof Element
          ? this.anchor
          : this.renderRoot.querySelector(".smartwindow-panel-list-anchor");
    }
    if (
      this.#panelList?.open &&
      (changedProperties.has("anchor") || changedProperties.has("groups"))
    ) {
      this.#reposition();
    }
  }

  async show(triggeringEvent = null) {
    await this.updateComplete;
    this.#panelList.show(triggeringEvent, this.#anchorElement);
  }

  async hide() {
    await this.updateComplete;
    this.#panelList.hide();
  }

  async toggle(triggeringEvent = null) {
    await this.updateComplete;
    this.#panelList.toggle(triggeringEvent, this.#anchorElement);
  }

  handlePanelClick(e) {
    const panelItem =
      e.target.closest("panel-item") ??
      e.target.closest(".panel-item-container")?.querySelector("panel-item");
    if (panelItem && !panelItem.classList.contains("panel-section-header")) {
      const event = new CustomEvent("item-selected", {
        detail: {
          id: panelItem.itemId,
          label: panelItem.itemLabel || panelItem.textContent.trim(),
          icon: panelItem.itemIcon,
        },
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      this.dispatchEvent(event);
    }
  }

  handleKeyDown(e) {
    this.dispatchEvent(
      new CustomEvent("panel-keydown", {
        detail: { originalEvent: e },
        bubbles: true,
        composed: true,
      })
    );
  }

  // -------------------------
  // Render helpers
  // -------------------------

  #isEmpty() {
    return !this.groups.length || this.groups.every(g => !g.items?.length);
  }

  #renderAnchor() {
    if (!this.anchor || this.anchor instanceof Element) {
      return null;
    }

    const rect = this.getBoundingClientRect();

    return html`<span
      class="smartwindow-panel-list-anchor"
      style=${styleMap({
        "--anchor-left": `${this.anchor.left - rect.left}px`,
        "--anchor-top": `${this.anchor.top - rect.top}px`,
        "--anchor-width": `${this.anchor.width}px`,
        "--anchor-height": `${this.anchor.height}px`,
      })}
    ></span>`;
  }

  #renderEmptyState() {
    return html`<panel-item
      disabled
      role="presentation"
      class="panel-section-header"
      data-l10n-id=${this.placeholderL10nId}
    ></panel-item>`;
  }

  #renderGroupHeader(headerL10nId) {
    return html`<panel-item
      disabled
      role="presentation"
      class="panel-section-header"
      data-l10n-id=${headerL10nId}
    ></panel-item>`;
  }

  #renderPlainHeader(header) {
    return html`<panel-item
      disabled
      role="presentation"
      class="panel-section-header"
    >
      ${header}
    </panel-item>`;
  }

  #computeItemStyles(item) {
    const styles = {};

    if (item.icon) {
      styles["--panel-item-icon-url"] = `url(${item.icon})`;
    }

    return styles;
  }

  #renderItem(item, isSelected = false) {
    const hasDescription = !!item.description || !!item.descriptionL10nId;
    const panelItem = html`<panel-item
      .itemId=${item.id}
      .itemLabel=${item.label ?? ""}
      icon=${ifDefined(!hasDescription && item.icon ? "true" : undefined)}
      class=${ifDefined(isSelected && !hasDescription ? "selected" : undefined)}
      data-l10n-id=${ifDefined(item.l10nId)}
      style=${styleMap(hasDescription ? {} : this.#computeItemStyles(item))}
    >
      ${item.l10nId ? "" : item.label}
    </panel-item>`;

    if (!hasDescription) {
      return panelItem;
    }

    return html`<div
      class=${classMap({ "panel-item-container": true, selected: isSelected })}
    >
      ${item.icon
        ? html`<span class="panel-item-icon" aria-hidden="true">
            <img class="panel-item-icon-image" src=${item.icon} alt="" />
          </span>`
        : ""}
      <div class="panel-item-text">
        ${panelItem}
        <div
          class="panel-item-description"
          data-l10n-id=${ifDefined(item.descriptionL10nId)}
        >
          ${item.descriptionL10nId ? "" : item.description}
        </div>
      </div>
    </div>`;
  }

  #renderGroup(group) {
    if (!group.items?.length) {
      return null;
    }

    let header = null;
    if (group.headerL10nId) {
      header = this.#renderGroupHeader(group.headerL10nId);
    } else if (group.header) {
      header = this.#renderPlainHeader(group.header);
    }

    return html`
      ${header}
      ${repeat(
        group.items,
        item => item.id,
        item =>
          this.#renderItem(
            item,
            this.#isCommandMode && item.id === this.selectedItemId
          )
      )}
    `;
  }

  #renderGroups() {
    return repeat(
      this.groups,
      (_group, index) => index,
      group => this.#renderGroup(group)
    );
  }

  #renderContent() {
    // Custom items were moved into `panel-list`.
    if (this.#hasCustomItems) {
      return nothing;
    }
    return this.#isEmpty() ? this.#renderEmptyState() : this.#renderGroups();
  }

  #renderCommandFooter() {
    if (!this.#isCommandMode || this.#hasCustomItems || this.#isEmpty()) {
      return nothing;
    }
    return html`<panel-item
      disabled
      role="note"
      class="panel-section-header panel-command-footer"
      data-l10n-id="smartbar-command-coming-soon"
    ></panel-item>`;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/smartwindow-panel-list.css"
      />
      ${this.#renderAnchor()}
      <panel-list
        @click=${this.handlePanelClick}
        @keydown=${this.handleKeyDown}
      >
        ${this.#renderContent()} ${this.#renderCommandFooter()}
      </panel-list>
    `;
  }
}

customElements.define("smartwindow-panel-list", SmartwindowPanelList);
