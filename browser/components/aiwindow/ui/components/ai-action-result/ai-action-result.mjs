/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/website-chip-container.mjs";

/**
 * Renders the result of a natural language action performed by the assistant
 * (e.g. "Closed tabs"). Shows the action label, summary, and an undo button
 * when available. Clicking the header toggles the expanded state, which
 * reveals a list of stacked rows, each with its own label and optional
 * affected items (website chips).
 *
 * Dispatches a CustomEvent named action-result-undo when the user clicks undo.
 * The parent is responsible for performing the actual reversal and updating
 * the action state.
 *
 * @attribute {string} label - Header label for plain text (e.g. "Closed tab", "Closed 3 tabs")
 * @attribute {string} labelL10nId - Fluent localization ID for the header label
 * @attribute {object} labelL10nArgs - Arguments for the label localization (e.g. { count: 3 })
 * @property {object} labelLink - Optional { l10nName, href } embedded in
 *   the header label. Requires <a data-l10n-name> in the l10n message.
 * @attribute {string} summary - Descriptive text for the action (plain text)
 * @attribute {string} summaryL10nId - Fluent localization ID for the summary
 * @attribute {object} summaryL10nArgs - Arguments for the summary localization
 * @attribute {boolean} canUndo - Whether the undo button should be shown
 * @attribute {boolean} isExpanded - Whether the detail section is visible
 * @property {Array} rows - List of stacked dot rows each shaped:
 *  {
 *    label?: string,           // Plain text label
 *    labelL10nId?: string,     // Fluent localization ID for the row label
 *    labelL10nArgs?: Object,   // Arguments for the row label localization
 *    link?: { l10nName: string, href: string },
 *                              // Optional link, same shape as labelLink
 *    items?: Array<{ url: string, label: string }>
 *  }
 */
export class AIActionResult extends MozLitElement {
  static properties = {
    label: { type: String },
    labelL10nId: { type: String },
    labelL10nArgs: { type: Object },
    labelLink: { type: Object },
    rows: { type: Array },
    summary: { type: String },
    summaryL10nId: { type: String },
    summaryL10nArgs: { type: Object },
    canUndo: { type: Boolean, attribute: "can-undo", reflect: true },
    isExpanded: { type: Boolean, attribute: "is-expanded", reflect: true },
  };

  constructor() {
    super();
    this.label = "";
    this.labelL10nId = null;
    this.labelL10nArgs = null;
    this.labelLink = null;
    this.rows = [];
    this.summary = "";
    this.summaryL10nId = null;
    this.summaryL10nArgs = null;
    this.canUndo = false;
    this.isExpanded = false;
  }

  connectedCallback() {
    super.connectedCallback();
    // The label link is a plain <a target="_blank"> that the browser opens
    // natively. It lives inside the header toggle button, so keep its click
    // from also toggling the card. Delegated in the capture phase because
    // Fluent DOM overlays replace the anchor node, dropping per-node listeners.
    this.renderRoot.addEventListener("click", this.#handleLabelLinkClick, true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.renderRoot.removeEventListener(
      "click",
      this.#handleLabelLinkClick,
      true
    );
  }

  #handleUndo() {
    this.dispatchEvent(
      new CustomEvent("action-result-undo", { bubbles: true, composed: true })
    );
  }

  #handleLabelLinkClick = event => {
    const onLabelLink = event
      .composedPath()
      .some(
        el =>
          el instanceof HTMLAnchorElement &&
          el.classList.contains("action-result-label-link")
      );
    if (onLabelLink) {
      event.stopPropagation();
    }
  };

  #handleToggle() {
    this.isExpanded = !this.isExpanded;
    this.dispatchEvent(
      new CustomEvent("action-result-toggle", {
        detail: { isExpanded: this.isExpanded },
        bubbles: true,
        composed: true,
      })
    );
  }

  #renderLabelContent(link, l10nId, fallbackLabel) {
    if (link) {
      return html`<a
        class="action-result-label-link"
        data-l10n-name=${link.l10nName}
        href=${link.href}
        target="_blank"
        rel="noopener"
      ></a>`;
    }
    if (l10nId) {
      return "";
    }
    return fallbackLabel;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-action-result.css"
      />
      <div class="action-result-wrapper">
        <button
          type="button"
          class="action-result-header"
          aria-expanded=${this.isExpanded}
          @click=${this.#handleToggle}
        >
          <span class="action-result-indicator" aria-hidden="true"></span>
          <span
            class="action-result-label"
            data-l10n-id=${this.labelL10nId || nothing}
            data-l10n-args=${this.labelL10nArgs
              ? JSON.stringify(this.labelL10nArgs)
              : nothing}
          >
            ${this.#renderLabelContent(
              this.labelLink,
              this.labelL10nId,
              this.label
            )}
          </span>
        </button>
        ${this.isExpanded
          ? html`
              <div class="action-result-expanded">
                ${this.rows.map(
                  row => html`
                    <div class="action-result-expanded-row">
                      <div class="action-result-expanded-row-header">
                        <span
                          class="action-result-dot"
                          aria-hidden="true"
                        ></span>
                        <span
                          class="action-result-expanded-row-label"
                          data-l10n-id=${row.labelL10nId || nothing}
                          data-l10n-args=${row.labelL10nArgs
                            ? JSON.stringify(row.labelL10nArgs)
                            : nothing}
                        >
                          ${this.#renderLabelContent(
                            row.link,
                            row.labelL10nId,
                            row.label
                          )}
                        </span>
                      </div>
                      ${row.items?.length
                        ? html`
                            <website-chip-container
                              class="action-result-chips"
                              .websites=${row.items}
                            ></website-chip-container>
                          `
                        : nothing}
                    </div>
                  `
                )}
              </div>
            `
          : nothing}
        ${this.summary || this.summaryL10nId
          ? html`<p
              class="action-result-summary"
              data-l10n-id=${this.summaryL10nId || nothing}
              data-l10n-args=${this.summaryL10nArgs
                ? JSON.stringify(this.summaryL10nArgs)
                : nothing}
            >
              ${!this.summaryL10nId ? this.summary : ""}
            </p>`
          : nothing}
        ${this.canUndo
          ? html`
              <moz-button
                class="action-result-undo"
                @click=${this.#handleUndo}
                data-l10n-id="smartwindow-nl-undo-button"
                type="ghost"
              ></moz-button>
            `
          : nothing}
      </div>
    `;
  }
}

customElements.define("ai-action-result", AIActionResult);
