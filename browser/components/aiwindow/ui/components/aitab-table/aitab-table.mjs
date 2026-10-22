/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { httpUrl } from "chrome://browser/content/aiwindow/modules/AITabUtils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/ai-website-chip.mjs";

/**
 * A column of the table, as described by the RankedTable `Field` schema in
 * component_schema.json.
 *
 * @typedef {object} Field
 * @property {string} key - Property read from each row object.
 * @property {string} [label] - Column heading; falls back to `key`.
 * @property {"text"|"number"|"currency"|"rating"|"date"} type - How the value
 *   is formatted.
 * @property {"title"|"subtitle"|"detail"} [role] - Where the value renders:
 *   title and subtitle share the first column, detail gets its own column.
 * @property {string} [prefix] - Text put before every value.
 * @property {string} [suffix] - Text put after every value.
 * @property {number} [max] - Denominator for `rating`.
 * @property {string} [currency] - ISO 4217 code for `currency`.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T/;

const formatters = new Map();

/**
 * @param {string} key
 * @param {Function} create
 * @returns {Intl.NumberFormat|Intl.DateTimeFormat}
 */
function formatter(key, create) {
  let instance = formatters.get(key);
  if (!instance) {
    instance = create();
    formatters.set(key, instance);
  }
  return instance;
}

function numberFormatter() {
  return formatter("number", () => new Intl.NumberFormat());
}

function ratingFormatter() {
  return formatter(
    "rating",
    () => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
  );
}

function currencyFormatter(currency) {
  return formatter(
    `currency:${currency}`,
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        trailingZeroDisplay: "stripIfInteger",
      })
  );
}

function dateFormatter(timeZone) {
  return formatter(
    `date:${timeZone ?? ""}`,
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone })
  );
}

/**
 * Formats a row's value for one column. Only machine-typed values are
 * formatted: numbers, and dates written as ISO 8601. A value the model already
 * wrote out as text, in whatever language and notation, is shown as it is.
 *
 * @param {Field} field
 * @param {object} row
 * @returns {string|import("lit").TemplateResult}
 */
function formatValue(field, row) {
  const value = row?.[field.key];
  if (value == null || value === "") {
    return "";
  }
  const prefix = field.prefix ?? "";
  const suffix = field.suffix ?? "";
  const isNumber = typeof value == "number" && Number.isFinite(value);
  switch (field.type) {
    case "number": {
      const text = isNumber ? numberFormatter().format(value) : value;
      return `${prefix}${text}${suffix}`;
    }
    case "currency": {
      if (!isNumber) {
        return `${prefix}${value}${suffix}`;
      }
      let text;
      try {
        text = currencyFormatter(field.currency ?? "USD").format(value);
      } catch {
        // The model gave a currency code Intl does not know.
        text = numberFormatter().format(value);
      }
      return `${prefix}${text}${suffix}`;
    }
    case "rating": {
      if (!isNumber) {
        return `${prefix}${value}${suffix}`;
      }
      const args = JSON.stringify({
        value: ratingFormatter().format(value),
        max: numberFormatter().format(field.max ?? 5),
      });
      return html`${prefix}<span
          data-l10n-id="ai-tab-table-rating"
          data-l10n-args=${args}
        ></span
        >${suffix}`;
    }
    case "date": {
      const isoDate =
        typeof value == "string" &&
        (DATE_ONLY.test(value) || ISO_DATE_TIME.test(value));
      const date = isoDate ? new Date(value) : null;
      if (!date || Number.isNaN(date.valueOf())) {
        return `${prefix}${value}${suffix}`;
      }
      const timeZone = DATE_ONLY.test(value) ? "UTC" : undefined;
      return `${prefix}${dateFormatter(timeZone).format(date)}${suffix}`;
    }
    default:
      return `${prefix}${value}${suffix}`;
  }
}

/**
 * Compares a small set of items across a few text attributes: a header row of
 * column labels and one row per item, whose name leads the row and can carry
 * a chip naming the site the item came from.
 *
 * @property {string} heading - Short title above the table.
 * @property {string} description - Optional one-sentence subtitle.
 * @property {Field[]} columns - Column definitions.
 * @property {object[]} rows - One object per item, keyed by the column keys.
 *   An optional `href` is the page the item came from, rendered as a source
 *   chip in the name cell.
 */
export class AITabTable extends MozLitElement {
  static properties = {
    heading: { type: String },
    description: { type: String },
    columns: { type: Array, attribute: false },
    rows: { type: Array, attribute: false },
  };

  constructor() {
    super();
    this.heading = "";
    this.description = "";
    this.columns = [];
    this.rows = [];
  }

  /**
   * Splits the columns by where they render. The first column that is not a
   * subtitle stands in as the title when no column claims that role.
   *
   * @returns {{title: ?Field, subtitles: Field[], details: Field[]}}
   */
  get #columnsByRole() {
    const title =
      this.columns.find(field => field.role == "title") ??
      this.columns.find(field => field.role != "subtitle");
    const subtitles = this.columns.filter(field => field.role == "subtitle");
    const details = this.columns.filter(
      field => field !== title && field.role != "subtitle"
    );
    return { title, subtitles, details };
  }

  #label(field) {
    return field.label || field.key;
  }

  #renderSourceChip(row) {
    const url = httpUrl(row?.href);
    if (!url) {
      return nothing;
    }
    return html`<ai-website-chip
      class="aitab-table-source"
      type="context-chip"
      size="small"
      .label=${url.hostname}
      .href=${url.href}
      .iconSrc=${`page-icon:${url.href}`}
      openLinkEvent="AITab:OpenLink"
    ></ai-website-chip>`;
  }

  #renderRow(row, { title, subtitles, details }) {
    const subtitleValues = subtitles
      .map(field => formatValue(field, row))
      .filter(Boolean);
    return html`<tr>
      <th scope="row">
        <div class="aitab-table-name-cell">
          <span class="aitab-table-name">${formatValue(title, row)}</span>
          ${subtitleValues.map(
            text => html`<span class="aitab-table-subtitle">${text}</span>`
          )}
          ${this.#renderSourceChip(row)}
        </div>
      </th>
      ${details.map(field => html`<td>${formatValue(field, row)}</td>`)}
    </tr>`;
  }

  render() {
    const { title, subtitles, details } = this.#columnsByRole;
    if (!title) {
      return nothing;
    }
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/aitab-table.css"
      />
      <section class="aitab-table">
        ${this.heading
          ? html`<h2 id="heading" class="aitab-table-heading">
              ${this.heading}
            </h2>`
          : nothing}
        ${this.description
          ? html`<p class="aitab-table-description">${this.description}</p>`
          : nothing}
        <table
          aria-labelledby=${this.heading ? "heading" : nothing}
          data-details=${details.length}
        >
          <colgroup>
            <col class="aitab-table-name-col" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">${this.#label(title)}</th>
              ${details.map(
                field => html`<th scope="col">${this.#label(field)}</th>`
              )}
            </tr>
          </thead>
          <tbody>
            ${this.rows.map(row =>
              this.#renderRow(row, { title, subtitles, details })
            )}
          </tbody>
        </table>
      </section>
    `;
  }
}

customElements.define("aitab-table", AITabTable);
