/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-input-text.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-input-url.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-textarea.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-select.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/monitor-icon.mjs";

const SCHEDULE_TYPES = Object.freeze({
  DAILY: "daily",
  WEEKLY: "weekly",
});

const SCHEDULE_ICON = "chrome://browser/skin/calendar-24.svg";
const TIME_ICON = "chrome://browser/skin/history-20.svg";
const MAX_WATCH_URLS = 5;

// How long to coalesce typing before mirroring the form to the host
const DRAFT_PERSIST_DELAY_MS = 250;

// Check times offered by the create card in 30-minute increments
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour24 = Math.floor(i / 2);
  const minute = i % 2 ? 30 : 0;

  // Create a date object with the specific time for localization
  const timeDate = new Date();
  timeDate.setHours(hour24, minute, 0, 0);

  // Use toLocaleTimeString for locale-appropriate formatting
  const label = timeDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return {
    value: `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    label,
  };
});

// Indexed by the weekday values used by the scheduler (0 = Sunday)
const WEEKDAYS = [
  { value: 0, ftlId: "ai-tasks-alert-weekday-sunday" },
  { value: 1, ftlId: "ai-tasks-alert-weekday-monday" },
  { value: 2, ftlId: "ai-tasks-alert-weekday-tuesday" },
  { value: 3, ftlId: "ai-tasks-alert-weekday-wednesday" },
  { value: 4, ftlId: "ai-tasks-alert-weekday-thursday" },
  { value: 5, ftlId: "ai-tasks-alert-weekday-friday" },
  { value: 6, ftlId: "ai-tasks-alert-weekday-saturday" },
];

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
 *  - agent-monitor-item:submit       detail: { mode, id, monitorName, condition, watchUrls, schedule }
 *  - agent-monitor-item:draft-change detail: { draft: MonitorDraft|null }
 *  - agent-monitor-item:cancel
 *  - agent-monitor-item:delete       detail: { id }
 *  - agent-monitor-item:pause        detail: { id, paused }
 *  - agent-monitor-item:check-now    detail: { id }
 *  - agent-monitor-item:open         detail: { id, url }
 *
 * @property {Agent} agent - Monitor data:
 *  {
 *    id: string,
 *    monitorName: string,
 *    url: string,
 *    faviconText?: string,      // 1-2 char fallback favicon glyph
 *    faviconColor?: string,     // fallback favicon background
 *    value?: string,            // current value, e.g. "$278"
 *    valueMeta?: string,        // e.g. "checked 2:14 PM · was $299"
 *    condition?: string,        // e.g. "the price drops below $270"
 *    conditionPresets?: string[],
 *    status?: { label: string, kind?: "watching"|"paused" },
 *    cadence?: string,
 *    history?: Array<{ when: string, oldValue?: string, newValue?: string,
 *                      note?: string, flag?: string, low?: boolean }>,
 *  }
 * @property {?MonitorDraft} draft - In-progress form state to restore over the
 *  values seeded from 'agent'. The card only renders it, the host owns it:
 *  every edit is mirrored back out via 'agent-monitor-item:draft-change' so an
 *  unsubmitted form survives the card being torn down and rebuilt.
 *  {
 *    editing?: boolean,        // reopen the edit form the draft belongs to
 *    monitorName?: string,
 *    condition?: string,
 *    watchUrls?: string[],
 *    pendingUrl?: string,
 *    schedule?: { frequency: string, time: string, weekday: number },
 *  }
 * @property {"display"|"create"} mode - Which card layout to render
 * @property {boolean} expanded - Whether the display card is expanded
 * @property {boolean} editing - Whether the editable condition field is shown
 * @property {boolean} showLastResult - Whether to show the last check result chip (defaults to false)
 */
export class AgentMonitorItem extends MozLitElement {
  static properties = {
    agent: { type: Object },
    draft: { type: Object },
    mode: { type: String, reflect: true },
    expanded: { type: Boolean, reflect: true },
    editing: { type: Boolean, reflect: true },
    showLastResult: { type: Boolean },
    checkFrequency: { type: String, state: true },
    scheduleTime: { type: String, state: true },
    scheduleWeekday: { type: Number, state: true },
    alertDescription: { type: String, state: true },
    pageUrls: { type: Array, state: true },
    pendingUrl: { type: String, state: true },
    pendingUrlError: { type: String, state: true },
  };

  constructor() {
    super();
    this.agent = {};
    this.draft = null;
    this.mode = "display";
    this.expanded = false;
    this.editing = false;
    this.showLastResult = false;
    this.checkFrequency = SCHEDULE_TYPES.DAILY;
    this.scheduleTime = "09:00";
    this.scheduleWeekday = 1;
    this.alertDescription = "";
    this.pageUrls = [];
    this.pendingUrl = "";
    this.pendingUrlError = "";
    this.#draftName = null;
  }

  #draftName;
  #draftPersistTimer = null;

  willUpdate(changed) {
    if (changed.has("agent")) {
      this.#seedFromAgent();
    }

    if (changed.has("agent") || changed.has("draft")) {
      this.#applyDraft();
    }
  }

  disconnectedCallback() {
    if (this.#draftPersistTimer) {
      this.#flushDraft();
    }
    super.disconnectedCallback();
  }

  #seedFromAgent() {
    this.#draftName = null;

    const { watchUrls, url, condition, expanded } = this.agent ?? {};
    let seededUrls = [];
    if (watchUrls?.length) {
      seededUrls = watchUrls;
    } else if (url) {
      seededUrls = [url];
    }
    this.pageUrls = seededUrls.filter(u => u?.trim().length);
    this.alertDescription = condition ?? "";
    this.pendingUrl = "";
    this.pendingUrlError = "";

    // If the agent data includes an expanded state, apply it
    if (expanded !== undefined) {
      this.expanded = expanded;
    }

    // Seed the schedule fields from an existing monitor so edit mode reflects
    // its current scheduled
    const schedule = this.agent?.schedule;
    if (schedule) {
      this.checkFrequency = schedule.frequency ?? this.checkFrequency;
      this.scheduleTime = schedule.time ?? this.scheduleTime;
      this.scheduleWeekday = schedule.weekday
        ? Number(schedule.weekday)
        : this.scheduleWeekday;
    }
  }

  /**
   * Restores an unsubmitted form over the values seeded from 'agent'.
   */
  #applyDraft() {
    if (!this.draft) {
      return;
    }
    const { editing, monitorName, condition, watchUrls, pendingUrl, schedule } =
      this.draft;

    // A draft only outlives the card while an edit is unsubmitted, so reopen
    // the form the user was in the middle of. The edit affordances live in the
    // expanded body, so the card has to come back expanded to show them.
    if (editing) {
      this.editing = true;
      this.expanded = true;
    }
    if (monitorName !== undefined) {
      this.#draftName = monitorName;
    }
    if (condition !== undefined) {
      this.alertDescription = condition;
    }
    if (watchUrls) {
      this.pageUrls = [...watchUrls];
    }
    if (pendingUrl !== undefined) {
      this.pendingUrl = pendingUrl;
    }
    if (schedule?.frequency) {
      this.checkFrequency = schedule.frequency;
    }
    if (schedule?.time) {
      this.scheduleTime = schedule.time;
    }
    if (schedule?.weekday !== undefined) {
      this.scheduleWeekday = Number(schedule.weekday);
    }
  }

  /**
   * Mirrors the in-progress form out to the host.
   *
   * @param {object} [options]
   * @param {boolean} [options.debounce] - Coalesce rapid edits, for typing
   */
  #persistDraft({ debounce = false } = {}) {
    if (this.mode !== "create" && !this.editing) {
      return;
    }
    this.#clearDraftTimer();
    if (!debounce) {
      this.#flushDraft();
      return;
    }
    this.#draftPersistTimer = setTimeout(
      () => this.#flushDraft(),
      DRAFT_PERSIST_DELAY_MS
    );
  }

  #flushDraft() {
    this.#clearDraftTimer();
    this.#dispatch("agent-monitor-item:draft-change", {
      draft: {
        editing: this.editing,
        monitorName: this.#monitorName,
        condition: this.alertDescription,
        watchUrls: [...this.pageUrls],
        pendingUrl: this.pendingUrl,
        schedule: {
          frequency: this.checkFrequency,
          time: this.scheduleTime,
          weekday: this.scheduleWeekday,
        },
      },
    });
  }

  #discardDraft() {
    this.#clearDraftTimer();
    this.#dispatch("agent-monitor-item:draft-change", { draft: null });
  }

  #clearDraftTimer() {
    if (this.#draftPersistTimer) {
      clearTimeout(this.#draftPersistTimer);
      this.#draftPersistTimer = null;
    }
  }

  #dispatch(type, detail) {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true })
    );
  }

  get #monitorName() {
    return this.#draftName ?? this.agent?.monitorName ?? "";
  }

  get #isFormValid() {
    const hasDescription = this.alertDescription?.trim().length > 0;
    const hasValidUrl = !!this.pageUrls.length;
    return hasDescription && hasValidUrl && !this.pendingUrlError;
  }

  #onNameInput(event) {
    this.#draftName = event.target.value;
    // Typing coalesces, a change (blur) flushes right away
    this.#persistDraft({ debounce: event.type === "input" });
  }

  #onCardClick(e) {
    if (e.target.closest("button, moz-button")) {
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
    // Opening the form is itself worth remembering, so an edit session that
    // hasn't been typed in yet survives too. Leaving discards the edit.
    if (this.editing) {
      this.#persistDraft();
    } else {
      this.#discardDraft();
    }
    this.#dispatch("agent-monitor-item:edit-toggle", { editing: this.editing });
  }

  #onConditionInput(event) {
    this.alertDescription = event.target.value;
    this.#persistDraft({ debounce: event.type === "input" });
  }

  #onPresetClick(preset) {
    this.alertDescription = preset;
    this.#persistDraft();
  }

  // TODO: Bug 2054529 - share this URL validation with about:tools' create form
  async #validateUrl(url) {
    const value = url.trim();
    if (!value) {
      return { valid: true, error: "" };
    }
    try {
      const { protocol } = new URL(value);
      if (protocol !== "http:" && protocol !== "https:") {
        const error = await document.l10n.formatValue(
          "ai-tasks-alert-error-http-only"
        );
        return { valid: false, error };
      }
      return { valid: true, error: "" };
    } catch {
      const error = await document.l10n.formatValue(
        "ai-tasks-alert-error-invalid-url"
      );
      return { valid: false, error };
    }
  }

  async #validatePendingUrl() {
    this.pendingUrlError = this.pendingUrl.trim()
      ? (await this.#validateUrl(this.pendingUrl)).error
      : "";
  }

  async #addUrl() {
    const url = this.pendingUrl.trim();
    if (!url) {
      return;
    }
    const { valid, error } = await this.#validateUrl(url);
    if (!valid) {
      this.pendingUrlError = error;
      return;
    }
    if (this.pageUrls.includes(url)) {
      this.pendingUrlError = await document.l10n.formatValue(
        "ai-tasks-alert-error-duplicate-url"
      );
      return;
    }
    if (this.pageUrls.length >= MAX_WATCH_URLS) {
      this.pendingUrlError = await document.l10n.formatValue(
        "ai-tasks-alert-error-max-urls",
        { count: MAX_WATCH_URLS }
      );
      return;
    }
    this.pageUrls = [...this.pageUrls, url];
    this.pendingUrl = "";
    this.pendingUrlError = "";
    this.#persistDraft();
  }

  #removeUrl(url) {
    this.pageUrls = this.pageUrls.filter(u => u !== url);
    this.#persistDraft();
  }

  #displayUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  #onPendingUrlInput(event) {
    this.pendingUrl = event.target.value;
    this.#validatePendingUrl();
    this.#persistDraft({ debounce: true });
  }

  #onPendingUrlKeydown(event) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    this.#addUrl();
  }

  #onCancel() {
    // Cancelling drops the whole card, and with it the draft the host holds,
    // so this only has to stop a coalesced edit from landing after that
    this.#clearDraftTimer();
    this.#dispatch("agent-monitor-item:cancel", {});
  }

  #onSubmit() {
    if (!this.#isFormValid) {
      return;
    }
    // The host drops the draft as it commits the form, so make sure a coalesced
    // edit can't land after that and resurrect it
    this.#clearDraftTimer();
    const isCreateMode = this.mode === "create";
    this.#dispatch("agent-monitor-item:submit", {
      mode: this.mode,
      id: this.agent?.id,
      monitorName: this.#monitorName,
      condition: this.alertDescription.trim(),
      watchUrls: [...this.pageUrls],
      schedule: {
        frequency: this.checkFrequency,
        time: this.scheduleTime,
        weekday: this.scheduleWeekday,
      },
      autoExpandAndCheck: isCreateMode, // Signal to expand and check after creation
    });
    // Exit edit mode after saving
    if (this.editing) {
      this.editing = false;
      this.#dispatch("agent-monitor-item:edit-toggle", { editing: false });
    }
  }

  #renderStatusChip() {
    const statusInfo = this.agent?.status;
    if (!statusInfo?.kind) {
      return nothing;
    }
    const l10nId =
      statusInfo.kind === "watching"
        ? "ai-tasks-alert-status-watching"
        : "ai-tasks-alert-status-paused";

    return html`
      <span
        class="status-chip ${statusInfo.kind}"
        data-kind=${statusInfo.kind}
        data-l10n-id=${l10nId}
      >
      </span>
    `;
  }

  #renderLastCheckedCondition() {
    // Get the most recent history item (first in array) to show its condition status
    const historyItems = this.agent?.history ?? [];
    const mostRecentItem = historyItems.length ? historyItems[0] : null;

    return html`
      ${mostRecentItem && mostRecentItem.conditionMet !== undefined
        ? html`<span
            class="status-chip"
            data-l10n-id=${mostRecentItem.conditionMet
              ? "ai-tasks-alert-last-result-met"
              : "ai-tasks-alert-last-result-not-met"}
          ></span>`
        : nothing}
    `;
  }

  #renderConditionField() {
    const presets = this.agent?.conditionPresets ?? [];
    return html`
      <div class="field">
        <moz-textarea
          class="monitor-condition-input"
          data-l10n-id="ai-tasks-alert-alert"
          data-l10n-attrs="placeholder,label,description"
          .value=${this.alertDescription}
          @input=${this.#onConditionInput}
          @change=${this.#onConditionInput}
        ></moz-textarea>
        ${presets.length
          ? html`<div class="chip-row">
              ${presets.map(
                preset =>
                  html`<moz-button
                    class="chip ${preset === this.alertDescription
                      ? "selected"
                      : ""}"
                    label=${preset}
                    @click=${() => this.#onPresetClick(preset)}
                  ></moz-button>`
              )}
            </div>`
          : nothing}
      </div>
    `;
  }

  #renderPagesField() {
    return html`
      <div class="field">
        <div class="pages-container">
          <div class="page-input-row">
            <moz-input-url
              class="form-input page-url-input ${this.pendingUrlError
                ? "error"
                : ""}"
              data-l10n-id="ai-tasks-alert-pages"
              data-l10n-attrs="placeholder,label"
              data-l10n-args=${JSON.stringify({
                maxPages: MAX_WATCH_URLS,
              })}
              .value=${this.pendingUrl}
              @input=${this.#onPendingUrlInput}
              @keydown=${this.#onPendingUrlKeydown}
              @blur=${() => this.#validatePendingUrl()}
            ></moz-input-url>
            <moz-button
              size="small"
              type="icon ghost"
              class="add-page-btn"
              iconsrc="chrome://global/skin/icons/plus.svg"
              data-l10n-id="ai-tasks-alert-add-url"
              data-l10n-attrs="aria-label"
              ?disabled=${this.pageUrls.length >= MAX_WATCH_URLS}
              @click=${() => this.#addUrl()}
            ></moz-button>
          </div>
          ${this.pendingUrlError
            ? html`<div class="error-message">${this.pendingUrlError}</div>`
            : nothing}
          ${this.pageUrls.length
            ? html`<div class="page-pills-row">
                ${this.pageUrls.map(
                  url =>
                    html`<span class="page-pill">
                      <span class="page-pill-url"
                        >${this.#displayUrl(url)}</span
                      >
                      <button
                        type="button"
                        class="page-pill-remove"
                        data-l10n-id="ai-tasks-alert-remove-page-label"
                        data-l10n-attrs="aria-label"
                        @click=${() => this.#removeUrl(url)}
                      ></button>
                    </span>`
                )}
              </div>`
            : nothing}
        </div>
      </div>
    `;
  }

  #transformHistoryItem(item) {
    // Only process items with valid timestamps
    if (!item.checkedAt) {
      return null;
    }

    // Format the timestamp
    const date = new Date(item.checkedAt);
    const displayTime =
      date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      " - " +
      date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

    // Handle error status
    if (item.status === "error") {
      return {
        when: displayTime,
        conditionMet: undefined,
        note: item.resultExplanation || "",
        noteL10nId: "smartwindow-agent-monitor-history-check-failed",
        status: item.status,
        low: true,
      };
    }

    // Handle conditionMet cases
    if (item.conditionMet) {
      return {
        when: displayTime,
        conditionMet: true,
        note: item.resultExplanation || "",
        status: item.status,
        low: false,
      };
    }

    // Handle condition not met
    return {
      when: displayTime,
      conditionMet: false,
      note: item.resultExplanation || "",
      noteL10nId: item.resultExplanation
        ? null
        : "smartwindow-agent-monitor-history-no-match",
      status: item.status,
      low: true,
    };
  }

  #renderHistory() {
    const historyItems = this.agent?.history ?? [];
    if (!historyItems.length) {
      return nothing;
    }

    return html`
      <div
        class="section-toggle"
        data-l10n-id="ai-tasks-alert-change-history"
      ></div>
      <div class="history">
        ${historyItems.map(item => {
          const normalizedItem = this.#transformHistoryItem(item);

          // Skip items without valid timestamps
          if (!normalizedItem) {
            return nothing;
          }

          return html`<div class="history-item">
            <span class="when">${normalizedItem.when}</span>
            ${normalizedItem.conditionMet !== undefined
              ? html`<span
                  class="condition-badge ${normalizedItem.conditionMet
                    ? "met"
                    : "not-met"}"
                  data-l10n-id=${normalizedItem.conditionMet
                    ? "ai-tasks-alert-condition-met"
                    : "ai-tasks-alert-condition-not-met"}
                ></span>`
              : html`<span>-</span>`}
            ${(() => {
              if (normalizedItem.noteL10nId) {
                return html`<span
                  data-l10n-id=${normalizedItem.noteL10nId}
                ></span>`;
              }
              if (normalizedItem.note) {
                return html`<span>${normalizedItem.note}</span>`;
              }
              return nothing;
            })()}
          </div>`;
        })}
      </div>
      <div class="history-note">
        <p data-l10n-id="ai-tasks-alert-change-history-description"></p>
      </div>
    `;
  }

  #onFrequencyChange(event) {
    this.checkFrequency = event.target.value;
    this.#persistDraft();
  }

  #onScheduleTimeChange(event) {
    this.scheduleTime = event.target.value;
    this.#persistDraft();
  }

  #onWeekdayChange(event) {
    this.scheduleWeekday = Number(event.target.value);
    this.#persistDraft();
  }

  #renderScheduleSummary() {
    const schedule = this.agent?.schedule;
    if (!schedule) {
      return nothing;
    }

    // Convert HH:MM string to a Date object for Fluent formatting
    // Use a fixed date to ensure consistent formatting
    const [hours, minutes] = schedule.time.split(":").map(Number);
    const timeDate = new Date();
    timeDate.setHours(hours, minutes, 0, 0);

    if (schedule.frequency === SCHEDULE_TYPES.WEEKLY) {
      // Map weekday index to the specific Fluent string ID
      const weekdayFluent = [
        "ai-tasks-alert-schedule-weekly-sunday",
        "ai-tasks-alert-schedule-weekly-monday",
        "ai-tasks-alert-schedule-weekly-tuesday",
        "ai-tasks-alert-schedule-weekly-wednesday",
        "ai-tasks-alert-schedule-weekly-thursday",
        "ai-tasks-alert-schedule-weekly-friday",
        "ai-tasks-alert-schedule-weekly-saturday",
      ];

      const fluentId = weekdayFluent[schedule.weekday];
      if (fluentId) {
        return html`<div class="monitor-row">
          <span
            class="val"
            data-l10n-id=${fluentId}
            data-l10n-args=${JSON.stringify({
              time: timeDate.getTime(),
            })}
          ></span>
        </div>`;
      }
    }

    return html`
      <span
        class="val"
        data-l10n-id="ai-tasks-alert-schedule-daily-at"
        data-l10n-args=${JSON.stringify({ time: timeDate.getTime() })}
      ></span>
    `;
  }

  #renderTimeField() {
    return html`<div class="form-section-half">
      <label
        class="form-label"
        data-l10n-id="ai-tasks-alert-time-label"
      ></label>
      <moz-select
        class="form-select"
        .value=${this.scheduleTime}
        @change=${this.#onScheduleTimeChange}
      >
        ${TIME_OPTIONS.map(
          opt =>
            html`<moz-option
              value=${opt.value}
              label=${opt.label}
              iconsrc=${TIME_ICON}
            ></moz-option>`
        )}
      </moz-select>
    </div>`;
  }

  #renderScheduler() {
    return html`
      <div class="form-row">
        <div class="schedule-container">
          <div class="form-section-half">
            <label
              class="form-label"
              data-l10n-id="ai-tasks-alert-check-label"
            ></label>
            <moz-select
              class="form-select"
              .value=${this.checkFrequency}
              @change=${this.#onFrequencyChange}
            >
              <moz-option
                value=${SCHEDULE_TYPES.DAILY}
                data-l10n-id="ai-tasks-alert-schedule-daily"
                iconsrc=${SCHEDULE_ICON}
              ></moz-option>
              <moz-option
                value=${SCHEDULE_TYPES.WEEKLY}
                data-l10n-id="ai-tasks-alert-schedule-weekly"
                iconsrc=${SCHEDULE_ICON}
              ></moz-option>
            </moz-select>
          </div>
          ${this.checkFrequency === SCHEDULE_TYPES.WEEKLY
            ? html`<div class="form-section-half">
                <label
                  class="form-label"
                  data-l10n-id="ai-tasks-alert-day-label"
                ></label>
                <moz-select
                  class="form-select"
                  value=${this.scheduleWeekday}
                  @change=${this.#onWeekdayChange}
                >
                  ${WEEKDAYS.map(
                    day =>
                      html`<moz-option
                        value=${day.value}
                        data-l10n-id=${day.ftlId}
                        iconsrc=${SCHEDULE_ICON}
                      ></moz-option>`
                  )}
                </moz-select>
              </div>`
            : nothing}
        </div>
        ${this.#renderTimeField()}
      </div>
    `;
  }

  #renderCreate() {
    const agent = this.agent ?? {};
    return html`
      <div class="monitor-card">
        <div class="title-container">
          <monitor-icon size="small"></monitor-icon>
          <h2
            class="monitor-card-state-title"
            data-l10n-id="ai-tasks-alert-modal-title"
          ></h2>
        </div>
        <div class="monitor-card-head">
          <div class="monitor-name-field">
            <moz-input-text
              class="monitor-name-input"
              data-l10n-id="ai-tasks-alert-name"
              data-l10n-attrs="label"
              .value=${this.#monitorName}
              @input=${this.#onNameInput}
              @change=${this.#onNameInput}
            ></moz-input-text>
          </div>
        </div>
        ${agent.value
          ? html`<div class="monitor-value">
              <span class="now">${agent.value}</span>
              ${agent.valueMeta
                ? html`<span class="from">${agent.valueMeta}</span>`
                : nothing}
            </div>`
          : nothing}
        ${this.#renderConditionField()} ${this.#renderPagesField()}
        ${this.#renderScheduler()}

        <div class="monitor-card-actions">
          <span class="spacer"></span>
          <moz-button
            id="cancel-create-button"
            type="default"
            data-l10n-id="ai-tasks-alert-cancel-button"
            data-l10n-attrs="label"
            @click=${this.#onCancel}
          ></moz-button>
          <moz-button
            type="primary"
            data-l10n-id="ai-tasks-alert-create-button"
            data-l10n-attrs="label"
            @click=${this.#onSubmit}
          ></moz-button>
        </div>
      </div>
    `;
  }

  #renderDisplay() {
    const agent = this.agent ?? {};
    return html`
      <div class="monitor-card chatcard" @click=${this.#onCardClick}>
        <div class="monitor-card-head">
          ${this.#renderStatusChip()}
          <span class="monitor-card-title"
            ><span class="monitor-card-name">${agent.monitorName}</span></span
          >
          <span class="spacer"></span>
          ${this.showLastResult ? this.#renderLastCheckedCondition() : nothing}
          <button
            type="button"
            class="chev"
            aria-expanded=${this.expanded}
            data-l10n-id="ai-tasks-alert-show-details"
            data-l10n-attrs="aria-label"
            @click=${this.#onToggle}
          ></button>
        </div>
        ${this.expanded ? this.#renderExpand() : nothing}
      </div>
    `;
  }

  #renderExpand() {
    const agent = this.agent ?? {};
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
          ? html`${this.#renderConditionField()} ${this.#renderPagesField()}
            ${this.#renderScheduler()}`
          : html`<div class="task-section">
                <div
                  class="task-header"
                  data-l10n-id="ai-tasks-alert-the-alert"
                ></div>
                <div class="task-content">${agent.condition}</div>
              </div>
              ${agent.watchUrls?.length
                ? html`<div class="url-section">
                    <div
                      class="section-toggle"
                      data-l10n-id="ai-tasks-alert-on-this-page"
                    ></div>
                    <div class="url-chips">
                      ${agent.watchUrls.map(
                        url =>
                          html`<span class="url-chip"
                            >${this.#displayUrl(url)}</span
                          >`
                      )}
                    </div>
                  </div>`
                : nothing}
              <div class="monitor-row">${this.#renderScheduleSummary()}</div>`}
        ${!this.editing ? this.#renderHistory() : nothing}

        <div class="monitor-card-actions">
          ${!this.editing
            ? html`<moz-button
                  id="edit-button"
                  type="default"
                  @click=${this.#onEditToggle}
                  data-l10n-id="ai-tasks-alert-edit-button"
                  data-l10n-attrs="label"
                ></moz-button>
                <moz-button
                  type="default"
                  @click=${() => {
                    const isPaused = agent.status?.kind === "paused";
                    this.#dispatch("agent-monitor-item:pause", {
                      id: agent.id,
                      paused: !isPaused,
                    });
                  }}
                  data-l10n-id=${agent.status?.kind === "paused"
                    ? "ai-tasks-alert-resume-button"
                    : "ai-tasks-alert-pause-button"}
                  data-l10n-attrs="label"
                ></moz-button>
                <moz-button
                  type="default"
                  @click=${() =>
                    this.#dispatch("agent-monitor-item:check-now", {
                      id: agent.id,
                    })}
                  data-l10n-id="ai-tasks-alert-check-now-button"
                  data-l10n-attrs="label"
                ></moz-button>`
            : nothing}

          <span class="spacer"></span>
          ${this.editing
            ? html` <moz-button
                  id="cancel-edit-button"
                  type="secondary"
                  @click=${this.#onEditToggle}
                  data-l10n-id="ai-tasks-alert-cancel-button"
                  data-l10n-attrs="label"
                ></moz-button
                ><moz-button
                  type="primary"
                  @click=${this.#onSubmit}
                  data-l10n-id="ai-tasks-alert-save-button"
                  data-l10n-attrs="label"
                ></moz-button>`
            : html`
                <moz-button
                  class="delete-button"
                  type="icon"
                  iconsrc="chrome://global/skin/icons/delete.svg"
                  data-l10n-id="ai-tasks-alert-delete-button"
                  data-l10n-attrs="aria-label"
                  @click=${() =>
                    this.#dispatch("agent-monitor-item:delete", {
                      id: agent.id,
                    })}
                ></moz-button>
              `}
        </div>
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
