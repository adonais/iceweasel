/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-input-text.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-input-url.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/monitors-display.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/monitor-icon.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-select.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-textarea.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/panel-list.mjs";

// Default constants - will be overridden by values from the actor
const DEFAULT_CONSTANTS = {
  TOTAL_NUM_MONITORS: 5,
  TOTAL_NUM_URLS_IN_MONITOR: 5,
  SCHEDULE_TYPES: {
    DAILY: "daily",
    WEEKLY: "weekly",
  },
  isMonitorRegionSupported: true,
  smartWindowSupportUrl: "https://support.mozilla.org/kb/smart-window",
};

// Actor action constants - must match the event names in SmartWindowTasksChild
const MONITOR_ACTIONS = {
  REQUEST_CONSTANTS: "RequestConstants",
  REQUEST_LIST_MONITORS: "RequestListMonitors",
  REQUEST_CREATE_MONITOR: "RequestCreateMonitor",
  REQUEST_DELETE_MONITOR: "RequestDeleteMonitor",
  REQUEST_UPDATE_MONITOR: "RequestUpdateMonitor",
  REQUEST_RUN_MONITOR: "RequestRunMonitor",
  REQUEST_PAUSE_MONITOR: "RequestPauseMonitor",
};

const SCHEDULE_ICON = "chrome://browser/skin/calendar-24.svg";
const TIME_ICON = "chrome://browser/skin/history-20.svg";

// Time options in 30-minute increments matching agent-monitor-item
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
 * AI Tasks component for displaying and managing tasks.
 *
 * @property {Array} tasks - Array of task items to display
 * @property {string} title - Title for the tasks section
 */
export class AITasks extends MozLitElement {
  static properties = {
    monitorName: { type: String },
    alertDescription: { type: String },
    pageUrls: { type: Array },
    pageUrlErrors: { type: Array },
    checkFrequency: { type: String },
    scheduleTime: { type: String },
    scheduleWeekday: { type: Number },
    monitors: { type: Array },
    pendingUrl: { type: String },
    pendingUrlError: { type: String },
  };

  constructor() {
    super();
    this.monitorName = "";
    this.alertDescription = "";
    this.pageUrls = [];
    this.pageUrlErrors = [];
    // Use default constants initially, will be updated from actor
    this._constants = { ...DEFAULT_CONSTANTS };
    this.checkFrequency = this._constants.SCHEDULE_TYPES.DAILY;
    this.scheduleTime = "09:00";
    this.scheduleWeekday = 1; // Monday
    this.monitors = [];
    this.pendingUrl = "";
    this.pendingUrlError = "";
  }

  // ===== Lifecycle Methods =====

  async connectedCallback() {
    super.connectedCallback();
    // Try to initialize actor but don't block if it fails (e.g., in tests)
    this.#initializeActor().catch(error => {
      console.warn("Failed to initialize actor (expected in tests):", error);
    });
    // Load monitors async but don't block
    this.loadMonitors().catch(error => {
      console.warn("Failed to load monitors (expected in tests):", error);
    });

    // Bind event handlers for agent-monitor-item events
    this.boundHandleMonitorDelete = this.handleMonitorDelete.bind(this);
    this.boundHandleMonitorPause = this.handleMonitorPause.bind(this);
    this.boundHandleMonitorCheckNow = this.handleMonitorCheckNow.bind(this);
    this.boundHandleMonitorSubmit = this.handleMonitorSubmit.bind(this);

    // Listen for events bubbling up from monitors-display > agent-monitor-item
    this.addEventListener(
      "agent-monitor-item:delete",
      this.boundHandleMonitorDelete
    );
    this.addEventListener(
      "agent-monitor-item:pause",
      this.boundHandleMonitorPause
    );
    this.addEventListener(
      "agent-monitor-item:check-now",
      this.boundHandleMonitorCheckNow
    );
    this.addEventListener(
      "agent-monitor-item:submit",
      this.boundHandleMonitorSubmit
    );
  }

  /**
   * Initializes the actor communication and loads constants from the parent process.
   *
   * @private
   */
  async #initializeActor() {
    try {
      // Get constants from the parent process
      const result = await this.#dispatchMonitorAction(
        MONITOR_ACTIONS.REQUEST_CONSTANTS
      );
      if (result?.success && result.constants) {
        // Store constants on the instance to avoid shared mutable state
        this._constants = Object.freeze(result.constants);
        // Update default frequency with the loaded constant
        this.checkFrequency = this._constants.SCHEDULE_TYPES.DAILY;
        // _constants is not a reactive property, so request a render to
        // reflect the actor-provided values (e.g. region support).
        this.requestUpdate();
      }
    } catch (error) {
      console.error("Failed to initialize SmartWindowTasks actor:", error);
    }
  }

  /**
   * Dispatches an action to the SmartWindowTasks actor and waits for a response.
   * This follows the same event-based pattern as ai-chat-content but adds
   * response handling for operations that need to return data.
   *
   * @param {string} action - The action name to dispatch (e.g., "RequestListMonitors")
   * @param {object} detail - Optional data to send with the action
   * @returns {Promise<object>} Promise that resolves with the response from the parent actor
   * @private
   */
  #dispatchMonitorAction(action, detail = {}) {
    return new Promise((resolve, reject) => {
      const eventType = `SmartWindowTasks:${action}`;

      // Set up one-time listeners for response
      const handleResponse = event => {
        // Clean up the error listener to prevent memory leaks
        this.removeEventListener(`${eventType}:Error`, handleError);
        resolve(event.detail);
      };

      const handleError = event => {
        // Clean up the response listener to prevent memory leaks
        this.removeEventListener(`${eventType}:Response`, handleResponse);
        reject(new Error(event.detail?.error || "Operation failed"));
      };

      this.addEventListener(`${eventType}:Response`, handleResponse, {
        once: true,
      });
      this.addEventListener(`${eventType}:Error`, handleError, { once: true });

      // Dispatch the request event
      this.dispatchEvent(
        new CustomEvent(eventType, {
          bubbles: true,
          detail,
        })
      );
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    // Remove event listeners
    this.removeEventListener(
      "agent-monitor-item:delete",
      this.boundHandleMonitorDelete
    );
    this.removeEventListener(
      "agent-monitor-item:pause",
      this.boundHandleMonitorPause
    );
    this.removeEventListener(
      "agent-monitor-item:check-now",
      this.boundHandleMonitorCheckNow
    );
    this.removeEventListener(
      "agent-monitor-item:submit",
      this.boundHandleMonitorSubmit
    );
  }

  // ===== Getters =====

  /**
   * Checks if the form has all required valid data to submit.
   *
   * @returns {boolean} True if form is valid, false otherwise
   */
  get isFormValid() {
    const hasDescription = this.alertDescription?.trim().length > 0;
    const hasValidUrl = Boolean(this.pageUrls.length);
    const hasNoPendingError = !this.pendingUrlError;
    return hasDescription && hasValidUrl && hasNoPendingError;
  }

  /**
   * Checks if the maximum number of monitors has been reached.
   *
   * @returns {boolean} True if max monitors reached, false otherwise
   */
  get isMaxMonitorsReached() {
    return this.monitors.length >= this._constants.TOTAL_NUM_MONITORS;
  }

  /**
   * Checks whether the current region supports monitors.
   *
   * @returns {boolean} True if monitors are supported in this region
   */
  get isMonitorRegionSupported() {
    return this._constants.isMonitorRegionSupported;
  }

  get #dialog() {
    return this.shadowRoot.querySelector("dialog");
  }

  // ===== Dialog Management =====

  openDialog() {
    this.#dialog?.showModal();
  }

  closeDialog() {
    this.resetForm();
    this.#dialog?.close();
  }

  /**
   * Resets all form fields to their initial state.
   */
  resetForm() {
    this.monitorName = "";
    this.alertDescription = "";
    this.pageUrls = [];
    this.pageUrlErrors = [];
    this.checkFrequency = this._constants.SCHEDULE_TYPES.DAILY;
    this.scheduleTime = "09:00";
    this.scheduleWeekday = 1;
    this.pendingUrl = "";
    this.pendingUrlError = "";
  }

  // ===== Monitor Management =====

  /**
   * Handles delete monitor event from agent-monitor-item.
   *
   * @param {CustomEvent} event - Event containing monitor id
   */
  async handleMonitorDelete(event) {
    const { id } = event.detail;
    try {
      const result = await this.#dispatchMonitorAction(
        MONITOR_ACTIONS.REQUEST_DELETE_MONITOR,
        { id }
      );
      // Only reload monitors if deletion actually occurred (not cancelled)
      if (result?.success && result?.deleted) {
        await this.loadMonitors(); // Refresh the list
      } else if (!result?.success) {
        console.error("Failed to delete monitor:", result?.error);
      }
      // If cancelled (result.success && result.cancelled), do nothing
    } catch (error) {
      console.error("Failed to delete monitor:", error);
    }
  }

  /**
   * Handles pause/unpause monitor event from agent-monitor-item.
   *
   * @param {CustomEvent} event - Event containing monitor id and paused state
   */
  async handleMonitorPause(event) {
    const { id, paused } = event.detail;
    try {
      const result = await this.#dispatchMonitorAction(
        MONITOR_ACTIONS.REQUEST_PAUSE_MONITOR,
        { id, pause: paused }
      );
      if (result?.success) {
        await this.loadMonitors(); // Refresh the list
      } else {
        console.error("Failed to pause monitor:", result?.error);
      }
    } catch (error) {
      console.error("Failed to pause monitor:", error);
    }
  }

  /**
   * Handles check now event from agent-monitor-item.
   *
   * @param {CustomEvent} event - Event containing monitor id
   */
  async handleMonitorCheckNow(event) {
    const { id } = event.detail;

    try {
      const result = await this.#dispatchMonitorAction(
        MONITOR_ACTIONS.REQUEST_RUN_MONITOR,
        { id }
      );
      if (result?.success) {
        await this.loadMonitors(); // Refresh the list
      } else {
        console.error("Failed to run monitor check:", result?.error);
      }
    } catch (error) {
      console.error("Failed to run monitor check:", error);
    }
  }

  /**
   * Handles submit/update event from agent-monitor-item edit mode.
   *
   * @param {CustomEvent} event - Event containing monitor data
   */
  async handleMonitorSubmit(event) {
    const { id, monitorName, condition, watchUrls, schedule } = event.detail;
    try {
      // Convert schedule format from agent-monitor-item to MonitorAgent format
      const monitorSchedule = schedule
        ? {
            type: schedule.frequency,
            hour: parseInt(schedule.time.split(":")[0], 10),
            minute: parseInt(schedule.time.split(":")[1], 10),
            ...(schedule.weekday != null && {
              weekday: parseInt(schedule.weekday, 10),
            }),
          }
        : null;

      const result = await this.#dispatchMonitorAction(
        MONITOR_ACTIONS.REQUEST_UPDATE_MONITOR,
        {
          id,
          updates: {
            title: monitorName,
            monitorPrompt: condition,
            watchUrls,
            schedule: monitorSchedule,
          },
        }
      );
      if (result?.success) {
        await this.loadMonitors(); // Refresh the list
      } else {
        console.error("Failed to update monitor:", result?.error);
      }
    } catch (error) {
      console.error("Failed to update monitor:", error);
    }
  }

  /**
   * Loads all existing monitors from the MonitorAgent.
   * Called on component connection and after creating new monitors.
   */
  async loadMonitors() {
    try {
      const result = await this.#dispatchMonitorAction(
        MONITOR_ACTIONS.REQUEST_LIST_MONITORS
      );
      if (result?.success) {
        this.monitors = result.monitors;
      } else {
        console.error("Failed to load monitors:", result?.error);
      }
    } catch (error) {
      console.error("Failed to load monitors:", error);
    }
  }

  /**
   * Handles the form submission to create a new monitor.
   * Validates form, configures schedule data, and creates the monitor.
   */
  async handleConfirm() {
    try {
      if (!this.isFormValid) {
        return;
      }

      const schedule = this.configureScheduleData();

      const result = await this.#dispatchMonitorAction(
        MONITOR_ACTIONS.REQUEST_CREATE_MONITOR,
        {
          prompt: this.alertDescription,
          watchUrls: this.pageUrls,
          pageTitle: this.monitorName,
          schedule,
          source: "about_page",
        }
      );

      if (!result?.success) {
        console.error("Failed to create monitor:", result?.error);
        return;
      }
    } catch (error) {
      console.error("Failed to create monitor:", error);
      return;
    }

    this.closeDialog();
    await this.loadMonitors();
  }

  /**
   * Configures the schedule data object based on selected frequency and time.
   *
   * @returns {object|null} Schedule configuration object or null if not scheduled
   */
  configureScheduleData() {
    const isScheduledFrequency = [
      this._constants.SCHEDULE_TYPES.DAILY,
      this._constants.SCHEDULE_TYPES.WEEKLY,
    ].includes(this.checkFrequency);

    if (!isScheduledFrequency || !this.scheduleTime) {
      return null;
    }

    const [hour, minute] = this.scheduleTime.split(":").map(Number);

    return {
      type: this.checkFrequency,
      ...(this.checkFrequency === this._constants.SCHEDULE_TYPES.WEEKLY && {
        weekday: this.scheduleWeekday,
      }),
      hour,
      minute,
    };
  }

  // ===== URL Management =====

  /**
   * Validates a URL string to ensure it's a valid HTTP/HTTPS URL.
   * Note: Empty strings are considered invalid URLs but return no error message
   * since the UI handles empty input separately.
   *
   * @param {string} url - The URL to validate
   * @returns {Promise<{valid: boolean, error: string}>} Validation result
   * TODO: Move this validation logic to a shared utility, will need in another component as well.
   */
  async validateUrl(url) {
    const value = url.trim();

    if (!value) {
      // Empty input is invalid but no error message needed
      // Callers handle empty strings separately
      return { valid: false, error: "" };
    }

    try {
      const { protocol } = new URL(value);

      if (protocol !== "http:" && protocol !== "https:") {
        const error = await document.l10n.formatValue(
          "ai-tasks-alert-error-http-only"
        );
        return {
          valid: false,
          error,
        };
      }

      return { valid: true, error: "" };
    } catch {
      const error = await document.l10n.formatValue(
        "ai-tasks-alert-error-invalid-url"
      );
      return {
        valid: false,
        error,
      };
    }
  }

  /**
   * Validates the pending URL input and sets error message if invalid.
   */
  async validatePendingUrl() {
    const url = this.pendingUrl.trim();
    if (url) {
      const validation = await this.validateUrl(url);
      this.pendingUrlError = validation.error;
    } else {
      this.pendingUrlError = "";
    }
  }

  /**
   * Adds a URL to the pageUrls array after validation.
   * Handles various validation scenarios including duplicates and max limit.
   */
  async addUrl() {
    const url = this.pendingUrl.trim();
    if (!url) {
      return;
    }

    const validation = await this.validateUrl(url);
    if (!validation.valid) {
      this.pendingUrlError = validation.error;
      return;
    }

    if (this.pageUrls.includes(url)) {
      this.pendingUrlError = await document.l10n.formatValue(
        "ai-tasks-alert-error-duplicate-url"
      );
      return;
    }

    if (this.pageUrls.length >= this._constants.TOTAL_NUM_URLS_IN_MONITOR) {
      this.pendingUrlError = await document.l10n.formatValue(
        "ai-tasks-alert-error-max-urls",
        { maxUrls: this._constants.TOTAL_NUM_URLS_IN_MONITOR }
      );
      return;
    }

    this.pageUrls = [...this.pageUrls, url];
    this.pendingUrl = "";
    this.pendingUrlError = "";
  }

  /**
   * Removes a URL from the pageUrls array.
   *
   * @param {string} url - The URL to remove
   */
  removeUrl(url) {
    this.pageUrls = this.pageUrls.filter(u => u !== url);
  }

  /**
   * Extracts and returns the hostname from a URL for display purposes.
   *
   * @param {string} url - The full URL
   * @returns {string} The hostname or the original URL if parsing fails
   */
  displayUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  // ===== Form Input Handlers =====

  handleMonitorNameInput(e) {
    this.monitorName = e.target.value;
  }

  handleAlertInput(e) {
    this.alertDescription = e.target.value;
  }

  handlePendingUrlInput(e) {
    this.pendingUrl = e.target.value;
    this.validatePendingUrl();
  }

  /**
   * Handles Enter key press in the URL input field to add the URL.
   *
   * @param {KeyboardEvent} e - The keyboard event
   */
  handlePendingUrlKeydown(e) {
    if (e.key !== "Enter") {
      return;
    }
    e.preventDefault();
    this.addUrl();
  }

  handleFrequencyChange(e) {
    this.checkFrequency = e.target.value;
  }

  handleTimeChange(e) {
    this.scheduleTime = e.target.value;
  }

  handleWeekdayChange(e) {
    this.scheduleWeekday = Number(e.target.value);
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-tasks.css"
      />

      <dialog class="modal-wrapper">
        <div class="modal-container">
          <div class="modal-header">
            <h2
              class="modal-title"
              data-l10n-id="ai-tasks-alert-modal-title"
            ></h2>

            <moz-button
              size="small"
              type="icon ghost"
              iconSrc="chrome://global/skin/icons/close.svg"
              @click=${() => this.closeDialog()}
            ></moz-button>
          </div>

          <div class="modal-content">
            <div class="form-row">
              <moz-input-text
                class="form-input"
                data-l10n-id="ai-tasks-alert-name"
                data-l10n-attrs="label"
                @input=${e => this.handleMonitorNameInput(e)}
                .value=${this.monitorName}
                maxlength="100"
              ></moz-input-text>
            </div>

            <div class="form-row">
              <moz-textarea
                class="form-textarea"
                data-l10n-id="ai-tasks-alert-alert"
                data-l10n-attrs="placeholder,label,description"
                @input=${e => this.handleAlertInput(e)}
                .value=${this.alertDescription}
              ></moz-textarea>
            </div>

            <div class="form-row">
              <div class="pages-container">
                <div class="page-input-row">
                  <moz-input-url
                    class="form-input ${this.pendingUrlError ? "error" : ""}"
                    data-l10n-id="ai-tasks-alert-pages"
                    data-l10n-attrs="placeholder,label"
                    data-l10n-args=${JSON.stringify({
                      maxPages: this._constants.TOTAL_NUM_URLS_IN_MONITOR,
                    })}
                    @input=${e => this.handlePendingUrlInput(e)}
                    @keydown=${e => this.handlePendingUrlKeydown(e)}
                    @blur=${() => this.validatePendingUrl()}
                    .value=${this.pendingUrl}
                    maxlength="2048"
                  ></moz-input-url>
                  <moz-button
                    size="small"
                    type="icon ghost"
                    class="add-page-btn"
                    iconSrc="chrome://global/skin/icons/plus.svg"
                    ?disabled=${this.pageUrls.length >=
                    this._constants.TOTAL_NUM_URLS_IN_MONITOR}
                    @click=${() => this.addUrl()}
                    data-l10n-id="ai-tasks-alert-add-url"
                    data-l10n-attrs="aria-label"
                  ></moz-button>
                </div>
                ${this.pendingUrlError
                  ? html`<div class="error-message">
                      ${this.pendingUrlError}
                    </div>`
                  : ""}
                ${this.pageUrls.length
                  ? html`
                      <div class="page-pills-row">
                        ${this.pageUrls.map(
                          url => html`
                            <span class="page-pill">
                              <span class="page-pill-url"
                                >${this.displayUrl(url)}</span
                              >
                              <button
                                type="button"
                                class="page-pill-remove"
                                data-l10n-id="ai-tasks-alert-remove-page-label"
                                data-l10n-attrs="aria-label,title"
                                @click=${() => this.removeUrl(url)}
                              ></button>
                            </span>
                          `
                        )}
                      </div>
                    `
                  : ""}
              </div>
            </div>

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
                    @change=${e => this.handleFrequencyChange(e)}
                  >
                    <moz-option
                      value=${this._constants.SCHEDULE_TYPES.DAILY}
                      data-l10n-id="ai-tasks-alert-schedule-daily"
                      iconsrc=${SCHEDULE_ICON}
                    ></moz-option>
                    <moz-option
                      value=${this._constants.SCHEDULE_TYPES.WEEKLY}
                      data-l10n-id="ai-tasks-alert-schedule-weekly"
                      iconsrc=${SCHEDULE_ICON}
                    ></moz-option>
                  </moz-select>
                </div>

                ${this.checkFrequency === this._constants.SCHEDULE_TYPES.DAILY
                  ? html`
                      <div class="form-section-half">
                        <label
                          class="form-label"
                          data-l10n-id="ai-tasks-alert-time-label"
                        ></label>
                        <moz-select
                          class="form-select"
                          .value=${this.scheduleTime}
                          @change=${e => this.handleTimeChange(e)}
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
                      </div>
                    `
                  : ""}
                ${this.checkFrequency === this._constants.SCHEDULE_TYPES.WEEKLY
                  ? html`
                      <div class="form-section-half">
                        <label
                          class="form-label"
                          data-l10n-id="ai-tasks-alert-day-label"
                        ></label>
                        <moz-select
                          class="form-select"
                          value=${this.scheduleWeekday}
                          @change=${e => this.handleWeekdayChange(e)}
                        >
                          ${WEEKDAYS.map(
                            day => html`
                              <moz-option
                                value=${day.value}
                                data-l10n-id=${day.ftlId}
                                iconsrc=${SCHEDULE_ICON}
                              ></moz-option>
                            `
                          )}
                        </moz-select>
                      </div>
                      <div class="form-section-half">
                        <label
                          class="form-label"
                          data-l10n-id="ai-tasks-alert-time-label"
                        ></label>
                        <moz-select
                          class="form-select"
                          .value=${this.scheduleTime}
                          @change=${e => this.handleTimeChange(e)}
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
                      </div>
                    `
                  : ""}
              </div>
            </div>
          </div>

          <div class="dialog-actions">
            <moz-button
              type="default"
              data-l10n-id="ai-tasks-alert-cancel-button"
              @click=${() => this.closeDialog()}
            ></moz-button>
            <moz-button
              type="primary"
              data-l10n-id="ai-tasks-alert-create-button"
              ?disabled=${!this.isFormValid}
              @click=${() => this.handleConfirm()}
            ></moz-button>
          </div>
        </div>
      </dialog>

      ${!this.isMonitorRegionSupported
        ? html`
            <div class="unavailable-wrapper">
              <div class="unavailable-container">
                <h2 data-l10n-id="ai-tasks-no-monitors-title"></h2>
                <p data-l10n-id="ai-tasks-no-monitors-message">
                  <a
                    href=${this._constants.smartWindowSupportUrl}
                    data-l10n-name="smart-window-link"
                    target="_blank"
                  ></a>
                </p>
              </div>
            </div>
          `
        : html`<div class="page-wrapper">
            <div class="page-container">
              <div class="header">
                <div class="title-container">
                  <monitor-icon></monitor-icon>
                  <h2 data-l10n-id="ai-tasks-page-title"></h2>
                </div>

                <moz-button
                  iconSrc="chrome://global/skin/icons/plus.svg"
                  type="primary"
                  class="add-task-button"
                  data-l10n-id="ai-tasks-add-alert-button"
                  ?disabled=${this.isMaxMonitorsReached}
                  @click=${() => this.openDialog()}
                ></moz-button>
              </div>
              <!-- Monitors display component -->

              <monitors-display
                .monitors=${this.monitors}
                .scheduleTypes=${this._constants.SCHEDULE_TYPES}
                .weekdays=${WEEKDAYS}
              ></monitors-display>
            </div>
          </div>`}
    `;
  }
}

customElements.define("ai-tasks", AITasks);
