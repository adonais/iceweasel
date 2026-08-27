/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, repeat } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/agent-monitor-item.mjs";

/**
 * Component for displaying monitor items using agent-monitor-item cards.
 *
 * @property {Array} monitors - Array of monitor objects to display
 * @property {object} scheduleTypes - Schedule type constants from parent
 * @property {Array} weekdays - Weekday definitions from parent (required for localization)
 */
export class MonitorsDisplay extends MozLitElement {
  static properties = {
    monitors: { type: Array },
    scheduleTypes: { type: Object },
    weekdays: { type: Array },
  };

  constructor() {
    super();
    this.monitors = [];
    this.scheduleTypes = {};
    this.weekdays = [];
  }

  buildMonitorStatus(monitor) {
    // Return the status with kind, let agent-monitor-item handle the localization
    const monitorStatus = monitor.enabled
      ? { kind: "watching" }
      : { kind: "paused" };

    return monitorStatus;
  }

  /**
   * Transforms a monitor object to match the agent-monitor-item format.
   *
   * @param {object} monitor - The monitor object from the database
   * @returns {object} Transformed agent object for agent-monitor-item
   */
  transformMonitorToAgent(monitor) {
    const monitorStatus = this.buildMonitorStatus(monitor);

    return {
      id: monitor.id,
      monitorName: monitor.title || "Untitled Monitor",
      url: monitor.watchUrls?.[0] || "",
      watchUrls: monitor.watchUrls || [],
      condition: monitor.monitorPrompt || "",
      status: monitorStatus,
      value: monitor.currentValue || "",
      valueMeta: monitor.lastRunTime
        ? `checked ${new Date(monitor.lastRunTime).toLocaleTimeString()}`
        : "",
      history: (monitor.history || []).slice().reverse(),
      // Pass the schedule data directly - agent-monitor-item will format it using FTL strings
      schedule: monitor.schedule
        ? {
            frequency: monitor.schedule.type,
            time: `${(monitor.schedule.hour ?? 0)
              .toString()
              .padStart(2, "0")}:${(monitor.schedule.minute ?? 0)
              .toString()
              .padStart(2, "0")}`,
            weekday: monitor.schedule.weekday?.toString(),
          }
        : null,
    };
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/monitors-display.css"
      />

      <div class="monitors-section">
        ${this.monitors.length
          ? html`
              <p data-l10n-id="ai-task-page-description"></p>

              <p
                class="monitors-count"
                data-l10n-id="ai-tasks-alerts-count"
                data-l10n-args=${JSON.stringify({
                  count: this.monitors.length,
                })}
              ></p>
              <div class="monitors-list">
                ${repeat(
                  this.monitors,
                  monitor => monitor.id,
                  monitor => html`
                    <agent-monitor-item
                      .showLastResult=${true}
                      .agent=${this.transformMonitorToAgent(monitor)}
                      mode="display"
                    ></agent-monitor-item>
                  `
                )}
              </div>
            `
          : html` <section class="no-monitors-wrapper">
              <div class="no-monitors-container">
                <h2 data-l10n-id="ai-task-page-no-alerts-title"></h2>
                <p data-l10n-id="ai-task-page-no-alerts"></p>
              </div>
            </section>`}
      </div>
    `;
  }
}

customElements.define("monitors-display", MonitorsDisplay);
