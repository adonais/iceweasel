/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-input-text.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-input-url.mjs";

/**
 * A single monitor card:
 * It has three modes and is host-agnostic - monitor data comes
 * in via the 'agent' property and every action is a bubbling CustomEvent for
 * the host to handle. The host also decides the collapse affordance (chat uses
 * the chevron; the page can click-to-expand), so the component only exposes
 * 'expanded'/'editing' state
 *
 * Modes:
 *  - "display": collapsed shows the head  with a chevron and
 *    expanded reveals the value, condition, actions and change history.
 *  - "create": the full form used when setting up a new monitor.
 *
 * Dispatches:
 *  - agent-monitor-item:toggle       detail: { expanded }
 *  - agent-monitor-item:edit-toggle  detail: { editing }
 *  - agent-monitor-item:submit       detail: { mode, id, productName, value, condition, watchUrls }
 *  - agent-monitor-item:cancel
 *  - agent-monitor-item:delete       detail: { id }
 *  - agent-monitor-item:pause        detail: { id }
 *  - agent-monitor-item:check-now    detail: { id }
 *  - agent-monitor-item:open         detail: { id, url }
 *
 * @property {Agent} agent - Monitor data:
 *  {
 *    id: string,
 *    productName: string,
 *    url: string,
 *    faviconText?: string,      // 1-2 char fallback favicon glyph
 *    faviconColor?: string,     // fallback favicon background
 *    value?: string,            // current value, e.g. "$278"
 *    valueMeta?: string,        // e.g. "checked 2:14 PM · was $299"
 *    condition?: string,        // e.g. "the price drops below $270"
 *    conditionPresets?: string[],
 *    status?: { label: string, kind?: "watching"|"triggered"|"paused" },
 *    cadence?: string,          // e.g. "Auto · on-device"
 *    history?: Array<{ when: string, oldValue?: string, newValue?: string,
 *                      note?: string, flag?: string, low?: boolean }>,
 *  }
 * @property {"display"|"create"} mode - Which card layout to render.
 * @property {boolean} expanded - Whether the display card is expanded.
 * @property {boolean} editing - Whether the editable condition field is shown.
 */
export class AgentMonitorItem extends MozLitElement {
  static properties = {
    agent: { type: Object },
    mode: { type: String, reflect: true },
    expanded: { type: Boolean, reflect: true },
    editing: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.agent = {};
    this.mode = "display";
    this.expanded = false;
    this.editing = false;
    this.#draftCondition = null;
    this.#draftUrls = null;
    this.#isAddingUrl = false;
    this.#pendingUrl = "";
    this.#draftName = null;
    this.#draftValue = null;
  }

  #draftCondition;
  #draftUrls;
  #isAddingUrl;
  #pendingUrl;
  #draftName;
  #draftValue;

  willUpdate(changed) {
    if (changed.has("agent")) {
      this.#draftCondition = null;
      this.#draftName = null;
      this.#draftValue = null;
      this.#draftUrls = null;
      this.#pendingUrl = "";
      this.#isAddingUrl = false;
    }
  }

  #dispatch(type, detail) {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true })
    );
  }

  get #condition() {
    return this.#draftCondition ?? this.agent?.condition ?? "";
  }

  get #productName() {
    return this.#draftName ?? this.agent?.productName ?? "";
  }

  get #value() {
    return this.#draftValue ?? this.agent?.value ?? "";
  }

  #onNameInput(event) {
    this.#draftName = event.target.value;
  }

  #onValueInput(event) {
    this.#draftValue = event.target.value;
  }

  #onCardClick(e) {
    if (e.target.closest("button")) {
      return;
    }
    this.#onToggle(e);
  }

  #onToggle() {
    this.expanded = !this.expanded;
    this.#dispatch("agent-monitor-item:toggle", { expanded: this.expanded });
  }

  #onEditToggle() {
    this.editing = !this.editing;

    if (this.editing) {
      this.expanded = true;
    }
    this.#dispatch("agent-monitor-item:edit-toggle", { editing: this.editing });
  }

  #onConditionInput(event) {
    this.#draftCondition = event.target.value;
  }

  #onPresetClick(preset) {
    this.#draftCondition = preset;
    this.requestUpdate();
  }

  #onSubmit() {
    this.#dispatch("agent-monitor-item:submit", {
      mode: this.mode,
      id: this.agent?.id,
      productName: this.#productName,
      value: this.#value,
      condition: this.#condition,
      watchUrls: this.#collectAddUrls(),
    });
  }

  #currentUrls() {
    if (this.#draftUrls) {
      return this.#draftUrls;
    }
    const { watchUrls, url } = this.agent ?? {};
    return watchUrls ?? (url ? [url] : []);
  }

  #collectAddUrls() {
    const urls = [...this.#currentUrls()];
    const pending = (this.#pendingUrl ?? "").trim();
    if (pending && !urls.includes(pending)) {
      urls.push(pending);
    }
    return urls;
  }

  #displayUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  #onRemoveUrl(url) {
    this.#draftUrls = this.#currentUrls().filter(u => u !== url);
    this.requestUpdate();
  }

  #onAddUrlClick() {
    this.#isAddingUrl = true;
    this.#pendingUrl = "";
    this.requestUpdate();
  }

  #onPendingUrlInput(event) {
    this.#pendingUrl = event.target.value;
  }

  #onPendingUrlKeydown(event) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const url = event.target.value.trim();
    if (url && !this.#currentUrls().includes(url)) {
      this.#draftUrls = [...this.#currentUrls(), url];
    }
    this.#pendingUrl = "";
    this.#isAddingUrl = false;
    this.requestUpdate();
  }

  #renderFavicon() {
    const { url, faviconText = "" } = this.agent ?? {};
    return faviconText.length
      ? html`<span class="favicon-sq favicon-fallback">${faviconText}</span>`
      : html`<img class="favicon-sq" src="page-icon:${url}" alt="" />`;
  }

  #renderStatusChip() {
    const statusInfo = this.agent?.status;
    if (!statusInfo?.label) {
      return nothing;
    }
    return html`<span
      class="status-chip"
      data-kind=${statusInfo.kind ?? "watching"}
    >
      ${statusInfo.kind === "watching"
        ? html`<span class="pulse-dot"></span>`
        : nothing}
      ${statusInfo.label}
    </span>`;
  }

  #renderConditionField() {
    const presets = this.agent?.conditionPresets ?? [];
    /* TODO: Add localize strings */
    return html`
      <div class="field">
        <span class="field-label">Alert me when</span>
        <moz-input-text
          class="monitor-condition-input"
          placeholder="e.g. the price drops below $270"
          .value=${this.#condition}
          @change=${this.#onConditionInput}
          aria-label="Alert condition"
        ></moz-input-text>
        ${presets.length
          ? html`<div class="chip-row">
              ${presets.map(
                preset =>
                  html`<moz-button
                    class="chip ${preset === this.#condition ? "selected" : ""}"
                    @click=${() => this.#onPresetClick(preset)}
                  >
                    ${preset}
                  </moz-button>`
              )}
            </div>`
          : nothing}
      </div>
    `;
  }

  #renderPagesField() {
    /* TODO: Add localize strings */
    return html`
      <div class="field">
        <span class="field-label">Pages</span>
        <div class="chip-row">
          ${this.#currentUrls().map(
            url =>
              html`<span class="page-pill">
                <img class="page-pill-favicon" src="page-icon:${url}" alt="" />
                <span class="page-pill-url">${this.#displayUrl(url)}</span>
                <button
                  type="button"
                  class="page-pill-remove"
                  aria-label="Remove page"
                  @click=${() => this.#onRemoveUrl(url)}
                ></button>
              </span>`
          )}
          ${this.#isAddingUrl
            ? html`<moz-input-url
                class="page-add-input"
                placeholder="Paste a URL"
                aria-label="Add a page URL"
                .value=${this.#pendingUrl}
                @change=${this.#onPendingUrlInput}
                @keydown=${this.#onPendingUrlKeydown}
              ></moz-input-url>`
            : html`<button
                type="button"
                class="chip chip-add"
                @click=${this.#onAddUrlClick}
              >
                <span class="chip-add-icon" aria-hidden="true"></span>
                Add URL
              </button>`}
        </div>
      </div>
    `;
  }

  #renderHistory() {
    const historyItems = this.agent?.history ?? [];
    if (!historyItems.length) {
      return nothing;
    }
    /* TODO: Add localize strings */
    return html`
      <hr class="rule" />
      <div class="section-toggle">Change history</div>
      <div class="history">
        ${historyItems.map(
          item =>
            html`<div class="history-item ${item.low ? "low" : ""}">
              <span class="when">${item.when}</span>
              ${item.oldValue
                ? html`<span class="old-value">${item.oldValue}</span
                    ><span class="arrow">→</span>`
                : nothing}
              ${item.newValue
                ? html`<span class="new-value">${item.newValue}</span>`
                : nothing}
              ${item.flag
                ? html`<span class="history-flag">${item.flag}</span>`
                : nothing}
              ${item.note
                ? html`<span class="deemphasized">${item.note}</span>`
                : nothing}
            </div>`
        )}
      </div>
    `;
  }

  #renderCreate() {
    const agent = this.agent ?? {};
    /* TODO: Add localize strings */
    return html`
      <div class="monitor-card">
        <div class="monitor-card-head">
          ${this.#renderFavicon()}
          ${agent.productName
            ? html`<span class="monitor-card-title"
                ><span class="monitor-card-name">${agent.productName}</span
                ><span class="monitor-card-url">${agent.url}</span></span
              >`
            : html`<span class="monitor-name-field"
                ><moz-input-text
                  class="monitor-name-input"
                  placeholder="Name this monitor"
                  .value=${this.#draftName}
                  @change=${this.#onNameInput}
                  aria-label="Monitor name"
                ></moz-input-text
                >${agent.url
                  ? html`<span class="monitor-card-url">${agent.url}</span>`
                  : nothing}</span
              >`}
        </div>
        ${agent.value
          ? html`<div class="monitor-value">
              <span class="now">${agent.value}</span>
              ${agent.valueMeta
                ? html`<span class="from">${agent.valueMeta}</span>`
                : nothing}
            </div>`
          : html`<div class="field">
              <span class="field-label">Current price</span>
              <moz-input-text
                class="monitor-price-input"
                placeholder="e.g. $278"
                .value=${this.#draftValue}
                @change=${this.#onValueInput}
                aria-label="Current price"
              ></moz-input-text>
            </div>`}
        ${this.#renderConditionField()} ${this.#renderPagesField()}
        <div class="monitor-card-actions">
          <span class="mono-dim">Runs on-device</span>
          <span class="spacer"></span>
          <button
            type="button"
            class="btn-ghost monitor-button"
            @click=${() => this.#dispatch("agent-monitor-item:cancel", {})}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary monitor-start"
            @click=${this.#onSubmit}
          >
            Start monitoring
          </button>
        </div>
      </div>
    `;
  }

  #renderDisplay() {
    const agent = this.agent ?? {};
    const subtitle =
      agent.status?.kind === "watching" ? agent.cadence : agent.url;
    /* TODO: Add localize strings */
    return html`
      <div class="monitor-card chatcard live" @click=${this.#onCardClick}>
        <div class="monitor-card-head">
          ${this.#renderFavicon()}
          <span class="monitor-card-title"
            ><span class="monitor-card-name">${agent.productName}</span
            ><span class="monitor-card-url"
              >${subtitle ?? agent.url}</span
            ></span
          >
          <span class="spacer"></span>
          ${this.#renderStatusChip()}
          <button
            type="button"
            class="page-action edit"
            title="Edit monitor"
            aria-label="Edit monitor"
            aria-pressed=${this.editing}
            @click=${this.#onEditToggle}
          ></button>
          <button
            type="button"
            class="chev"
            aria-expanded=${this.expanded}
            aria-label="Show monitor details"
            @click=${this.#onToggle}
          ></button>
        </div>
        ${this.expanded ? this.#renderExpand() : nothing}
      </div>
    `;
  }

  #renderExpand() {
    const agent = this.agent ?? {};
    /* TODO: Add localize strings */
    return html`
      <div class="watch-expand" @click=${e => e.stopPropagation()}>
        ${agent.value
          ? html`<div class="monitor-value">
              <span class="now">${agent.value}</span>
              ${agent.valueMeta
                ? html`<span class="from">${agent.valueMeta}</span>`
                : nothing}
            </div>`
          : nothing}
        ${this.editing
          ? this.#renderConditionField()
          : html`<div class="monitor-row">
              <span class="label">Alert me when</span>
              <span class="val">${agent.condition}</span>
            </div>`}
        ${agent.cadence
          ? html`<div class="monitor-row">
              <span class="label">Check</span
              ><span class="val">${agent.cadence}</span>
            </div>`
          : nothing}
        <div class="monitor-card-actions">
          <button
            type="button"
            class="page-action danger delete"
            title="Delete monitor"
            aria-label="Delete monitor"
            @click=${() =>
              this.#dispatch("agent-monitor-item:delete", { id: agent.id })}
          ></button>
          <button
            type="button"
            class="btn-ghost monitor-button"
            @click=${() =>
              this.#dispatch("agent-monitor-item:pause", { id: agent.id })}
          >
            Pause
          </button>
          <span class="spacer"></span>
          ${this.editing
            ? html`<button
                type="button"
                class="btn-ghost monitor-button save"
                @click=${this.#onSubmit}
              >
                Save
              </button>`
            : html`<button
                type="button"
                class="btn-ghost monitor-button check-now"
                @click=${() =>
                  this.#dispatch("agent-monitor-item:check-now", {
                    id: agent.id,
                  })}
              >
                Check now
              </button>`}
        </div>
        ${this.#renderHistory()}
      </div>
    `;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/agent-monitor-item.css"
      />
      ${this.mode === "create" ? this.#renderCreate() : this.#renderDisplay()}
    `;
  }
}

customElements.define("agent-monitor-item", AgentMonitorItem);
