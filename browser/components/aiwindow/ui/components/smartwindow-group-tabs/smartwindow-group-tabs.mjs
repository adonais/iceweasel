/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  html,
  keyed,
  nothing,
  styleMap,
} from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/tabbrowser/tab-groups-list.mjs";

const HEADING_ID = "smartwindow-group-tabs-heading";
const DEFAULT_FAVICON_URL = "chrome://global/skin/icons/defaultFavicon.svg";
const ROW_SELECTOR = ".swgt-flyout-tab, .tab-group-row";
const GROUP_ICON_URL =
  "chrome://browser/skin/tabbrowser/tab-group-chicklet.svg";

function favicon(info) {
  return html`<img
    class="swgt-favicon"
    src=${info.iconUrl}
    alt=""
    @error=${e => {
      if (e.target.src !== DEFAULT_FAVICON_URL) {
        e.target.src = DEFAULT_FAVICON_URL;
      }
    }}
  />`;
}

/**
 * Card shown in the "Group my tabs" panel: the suggested groups the user can
 * create and, once some are created, a list of recent groups they can undo.
 *
 */
export class SmartwindowGroupTabsCard extends MozLitElement {
  static properties = {
    computing: { type: Boolean },
    suggestions: { attribute: false },
    recent: { attribute: false },
    duplicates: { type: Number },
    tabGroups: { type: Number },
  };

  constructor() {
    super();
    this.computing = false;
    this.suggestions = [];
    this.recent = [];
    this.duplicates = 0;
    this.tabGroups = 0;
    this.addEventListener("keydown", e => this.#onKeyDown(e));
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.classList.add("swgt-card");
    this.setAttribute("role", "dialog");
    this.setAttribute("aria-labelledby", HEADING_ID);
    this.setAttribute("tabindex", "-1");
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  #favicons(tabInfos) {
    return html`<div class="swgt-favicons" aria-hidden="true">
      ${tabInfos.slice(0, 3).map(info => favicon(info))}
    </div>`;
  }

  get #rows() {
    return [...this.querySelectorAll(".swgt-row")];
  }

  #focusRowAt(index) {
    const rows = this.#rows;
    if (rows.length) {
      rows.at(index % rows.length)?.focus();
    }
  }

  #moveRowFocus(direction) {
    const current = this.#rows.indexOf(
      this.ownerDocument.activeElement?.closest(".swgt-row")
    );
    if (current < 0) {
      this.#focusRowAt(direction > 0 ? 0 : -1);
      return;
    }
    this.#focusRowAt(current + direction);
  }

  #onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        this.#moveRowFocus(1);
        break;
      case "ArrowUp":
        this.#moveRowFocus(-1);
        break;
      case "Home":
        this.#focusRowAt(0);
        break;
      case "End":
        this.#focusRowAt(-1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  #emitPreview(event, detail, source) {
    this.#emit("preview", {
      ...detail,
      anchor: event.currentTarget,
      source,
    });
  }

  #onRowFocus(event, detail) {
    if (event.currentTarget.hasAttribute("refocused-by-panel")) {
      return;
    }
    this.#emitPreview(event, detail, "focus");
  }

  #onRowKeyDown(event, detail = null) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();

      if (detail) {
        this.#emit("preview-enter", { ...detail, anchor: event.currentTarget });
      } else {
        this.#emit("view-tab-groups", { anchor: event.currentTarget });
      }
    }
  }

  #suggestionRow(suggestion) {
    return html`<button
      type="button"
      class="swgt-row swgt-suggestion"
      aria-expanded="false"
      data-l10n-id="smartwindow-group-tabs-suggestion"
      data-l10n-args=${JSON.stringify({
        groupLabel: suggestion.label,
        tabCount: suggestion.tabInfos.length,
      })}
      @mouseenter=${e => this.#emitPreview(e, { id: suggestion.id }, "hover")}
      @focus=${e => this.#onRowFocus(e, { id: suggestion.id })}
      @mouseleave=${() => this.#emit("preview-end")}
      @blur=${() => this.#emit("preview-end")}
      @keydown=${e => this.#onRowKeyDown(e, { id: suggestion.id })}
      @click=${() => this.#emit("create-one", { id: suggestion.id })}
    >
      <span class="swgt-row-label">${suggestion.label}</span>
      ${this.#favicons(suggestion.tabInfos)}
    </button>`;
  }

  #recentRow(entry) {
    return html`<div class="swgt-recent-row">
      <img
        class="swgt-group-icon"
        src=${GROUP_ICON_URL}
        alt=""
        style=${styleMap({
          "--tab-group-color": `var(--tab-group-${entry.color})`,
          "--tab-group-color-invert": `var(--tab-group-${entry.color}-invert)`,
          "--tab-group-background-color": `var(--tab-group-${entry.color})`,
        })}
      />
      <span class="swgt-row-label">${entry.label}</span>
    </div>`;
  }

  render() {
    const hasSuggestions = !this.computing && !!this.suggestions.length;
    const hasRecent = !this.computing && !!this.recent.length;
    let note = null;
    if (!this.computing && !hasSuggestions) {
      note = hasRecent
        ? "smartwindow-group-tabs-all-sorted"
        : "smartwindow-group-tabs-empty";
    }

    return [
      html`<h1
        class="swgt-header"
        id=${HEADING_ID}
        data-l10n-id="smartwindow-group-tabs-panel-heading"
      ></h1>`,
      html`<hr class="swgt-separator" />`,
      this.computing
        ? html`<div
            class="swgt-message swgt-loading"
            data-l10n-id="smartwindow-group-tabs-loading"
          ></div>`
        : nothing,
      note
        ? html`<div class="swgt-note">
            <span class="swgt-message" data-l10n-id=${note}></span>
            <span class="swgt-note-art" aria-hidden="true"></span>
          </div>`
        : nothing,
      hasSuggestions
        ? html`<h2
              class="swgt-section"
              data-l10n-id="smartwindow-group-tabs-suggested-heading"
            ></h2>
            ${this.suggestions.length > 1
              ? html`<button
                  type="button"
                  class="swgt-row swgt-create-all"
                  @click=${() => this.#emit("create-all")}
                >
                  <span class="swgt-create-all-icon" aria-hidden="true"></span>
                  <span
                    class="swgt-row-label"
                    data-l10n-id="smartwindow-group-tabs-create-all"
                  ></span>
                </button>`
              : nothing}
            ${this.suggestions.map(s => this.#suggestionRow(s))}`
        : nothing,
      hasRecent
        ? html`<h2
              class="swgt-section"
              data-l10n-id="smartwindow-group-tabs-just-created-heading"
            ></h2>
            ${this.recent.map(entry => this.#recentRow(entry))}
            <button
              type="button"
              class="swgt-row swgt-ungroup"
              @click=${() => this.#emit("ungroup")}
            >
              <span class="swgt-ungroup-icon" aria-hidden="true"></span>
              <span
                class="swgt-row-label"
                data-l10n-id="smartwindow-group-tabs-ungroup"
              ></span>
            </button>`
        : nothing,
      this.tabGroups || this.duplicates
        ? html`<hr class="swgt-separator" />
            ${this.tabGroups
              ? html`<button
                  type="button"
                  class="swgt-row swgt-view-tab-groups"
                  aria-expanded="false"
                  @click=${e =>
                    this.#emit("view-tab-groups", { anchor: e.currentTarget })}
                  @keydown=${e => this.#onRowKeyDown(e)}
                >
                  <span
                    class="swgt-row-label"
                    data-l10n-id="smartwindow-group-tabs-view-tab-groups"
                  ></span>
                </button>`
              : nothing}
            ${this.duplicates
              ? html`<button
                  type="button"
                  class="swgt-row swgt-close-duplicates"
                  aria-expanded="false"
                  data-l10n-id="smartwindow-group-tabs-close-duplicates"
                  data-l10n-args=${JSON.stringify({
                    tabCount: this.duplicates,
                  })}
                  @mouseenter=${e =>
                    this.#emitPreview(e, { duplicates: true }, "hover")}
                  @focus=${e => this.#onRowFocus(e, { duplicates: true })}
                  @mouseleave=${() => this.#emit("preview-end")}
                  @blur=${() => this.#emit("preview-end")}
                  @keydown=${e => this.#onRowKeyDown(e, { duplicates: true })}
                  @click=${() => this.#emit("close-duplicates")}
                ></button>`
              : nothing}`
        : nothing,
    ];
  }
}
customElements.define("smartwindow-group-tabs-card", SmartwindowGroupTabsCard);

/**
 * Flyout shown to the side of the row it belongs to. It lists one of: the tabs
 * of one suggested group, the duplicate tabs a close would remove (activating a
 * tab in either switches to it), or, with groupsListId set, the user's existing
 * tab groups, which the tabbrowser's own <tab-groups-list> renders and acts on.
 * Each opening of that list gets its own groupsListId, so a new
 * <tab-groups-list> is built: it only reads the groups when it is connected.
 */
export class SmartwindowGroupTabsFlyout extends MozLitElement {
  static properties = {
    suggestion: { attribute: false },
    duplicates: { attribute: false },
    groupsListId: { type: Number },
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.classList.add("swgt-flyout");
  }

  async getUpdateComplete() {
    const result = await super.getUpdateComplete();
    await this.querySelector("tab-groups-list")?.updateComplete;
    return result;
  }

  focusFirstRow() {
    this.querySelector(ROW_SELECTOR)?.focus();
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  #onKeyDown(event) {
    const row = event.target.closest(ROW_SELECTOR);
    if (!row) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        const rows = [...this.querySelectorAll(ROW_SELECTOR)];
        const step = event.key === "ArrowDown" ? 1 : -1;
        rows[rows.indexOf(row) + step]?.focus();
        break;
      }
      case "ArrowLeft":
      case "ArrowRight":
        this.#emit("close-flyout");
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  #onGroupsClick(event) {
    if (event.target.closest("button, moz-button")) {
      this.#emit("close-panel");
    }
  }

  render() {
    if (this.groupsListId) {
      return html`<div
        class="swgt-flyout-list"
        role="group"
        data-l10n-id="smartwindow-group-tabs-groups-list"
        @keydown=${e => this.#onKeyDown(e)}
        @click=${e => this.#onGroupsClick(e)}
      >
        ${keyed(this.groupsListId, html`<tab-groups-list></tab-groups-list>`)}
      </div>`;
    }

    if (this.duplicates?.length) {
      return this.#tabList(this.duplicates, index =>
        this.#emit("select-tab", { id: null, index })
      );
    }

    const suggestion = this.suggestion;
    if (!suggestion) {
      return nothing;
    }
    return this.#tabList(
      suggestion.tabInfos,
      index => this.#emit("select-tab", { id: suggestion.id, index }),
      suggestion.label
    );
  }

  /**
   * One row per tab, each switching to it.
   *
   * @param {object[]} tabInfos
   * @param {Function} onSelect - Called with the row's position in the list.
   * @param {string} [groupLabel] - Names the suggested group being previewed;
   *   without one the list is the duplicate tabs.
   * @returns {object} A Lit template.
   */
  #tabList(tabInfos, onSelect, groupLabel = "") {
    return html`<div
      class="swgt-flyout-list"
      role="group"
      data-l10n-id=${groupLabel
        ? "smartwindow-group-tabs-flyout-list"
        : "smartwindow-group-tabs-duplicates-list"}
      data-l10n-args=${groupLabel ? JSON.stringify({ groupLabel }) : nothing}
      @keydown=${e => this.#onKeyDown(e)}
    >
      ${tabInfos.map(
        (info, index) =>
          html`<button
            type="button"
            class="swgt-flyout-tab"
            title=${info.title}
            @click=${() => onSelect(index)}
          >
            ${favicon(info)}
            <span class="swgt-flyout-tab-label">${info.title}</span>
          </button>`
      )}
    </div>`;
  }
}
customElements.define(
  "smartwindow-group-tabs-flyout",
  SmartwindowGroupTabsFlyout
);
