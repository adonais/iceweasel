/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MonitorAgent:
    "moz-src:///browser/components/aiwindow/models/agents/MonitorAgent.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  Region: "resource://gre/modules/Region.sys.mjs",
  URILoadingHelper: "resource:///modules/URILoadingHelper.sys.mjs",
});

const localization = new Localization(
  [
    "preview/aiWindow.ftl",
    "branding/brand.ftl",
    "toolkit/branding/brandings.ftl",
  ],
  true
);

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "monitorSupportedRegions",
  "browser.smartwindow.agent.supportedRegions",
  ""
);

export const SCHEDULE_TYPES = Object.freeze({
  DAILY: "daily",
  WEEKLY: "weekly",
});

export const DAILY_SCHEDULE_L10N_ID = "ai-tasks-alert-schedule-daily-at";

// Indexed by the weekday values used by the scheduler (0 = Sunday)
export const WEEKLY_SCHEDULE_L10N_IDS = Object.freeze([
  "ai-tasks-alert-schedule-weekly-sunday",
  "ai-tasks-alert-schedule-weekly-monday",
  "ai-tasks-alert-schedule-weekly-tuesday",
  "ai-tasks-alert-schedule-weekly-wednesday",
  "ai-tasks-alert-schedule-weekly-thursday",
  "ai-tasks-alert-schedule-weekly-friday",
  "ai-tasks-alert-schedule-weekly-saturday",
]);

/**
 * Shared utilities for monitor UI operations
 */
export const MonitorUIUtils = {
  /**
   * Show a confirmation prompt before deleting a monitor and delete if confirmed.
   *
   * @param {BrowsingContext} browsingContext - The browsing context for the prompt
   * @param {string} monitorId - The ID of the monitor to delete
   * @param {boolean} skipConfirmation - Skip confirmation dialog (for tests)
   * @returns {Promise<{success: boolean, deleted: boolean, cancelled: boolean}>}
   */
  async deleteMonitorWithConfirmation(
    browsingContext,
    monitorId,
    skipConfirmation = false
  ) {
    try {
      let confirmed = skipConfirmation;

      if (!skipConfirmation) {
        // Localize the prompt strings
        const [title, message, deleteButton] = await localization.formatValues([
          { id: "ai-tasks-alert-delete-confirmation-title" },
          { id: "ai-tasks-alert-delete-confirmation-message" },
          { id: "ai-tasks-alert-delete-confirm-button" },
        ]);

        // Set up the button flags for the prompt
        const flags =
          (Ci.nsIPromptService.BUTTON_TITLE_IS_STRING *
            Ci.nsIPromptService.BUTTON_POS_0) |
          (Ci.nsIPromptService.BUTTON_TITLE_CANCEL *
            Ci.nsIPromptService.BUTTON_POS_1) |
          Ci.nsIPromptService.BUTTON_POS_1_DEFAULT;

        // Show the confirmation prompt
        const result = await Services.prompt.asyncConfirmEx(
          browsingContext,
          Ci.nsIPrompt.MODAL_TYPE_INTERNAL_WINDOW,
          title,
          message,
          flags,
          deleteButton,
          null,
          null,
          null,
          false,
          { useTitle: true }
        );

        // Check if user clicked Delete (button 0)
        confirmed = result.get("buttonNumClicked") === 0;
      }

      if (!confirmed) {
        return {
          success: true,
          deleted: false,
          cancelled: true,
        };
      }

      // User confirmed, proceed with deletion
      const deleted = await lazy.MonitorAgent.deleteMonitor(monitorId);
      return {
        success: true,
        deleted,
        cancelled: false,
      };
    } catch (error) {
      console.error("Failed to delete monitor:", error);
      return {
        success: false,
        deleted: false,
        cancelled: false,
        error: error.message,
      };
    }
  },

  buildMonitorStatus(monitor) {
    // Return the status with kind, let agent-monitor-item handle the localization
    const monitorStatus = monitor.enabled
      ? { kind: "watching" }
      : { kind: "paused" };

    return monitorStatus;
  },

  /**
   * Transforms a monitor object to match the display format.
   *
   * @param {object} monitor - The monitor object from the database
   * @returns {object}
   */
  formatMonitorForDisplay(monitor) {
    const monitorStatus = this.buildMonitorStatus(monitor);

    return {
      id: monitor.id,
      monitorName: monitor.title || "",
      url: monitor.watchUrls?.[0] || "",
      watchUrls: monitor.watchUrls || [],
      condition: monitor.monitorPrompt || "",
      enabled: !!monitor.enabled,
      status: monitorStatus,
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
  },

  /**
   * The Fluent string that states when a monitor checks, e.g. "Check daily at
   * 9:00 AM". Callers render it themselves so the string can be localized in
   * whichever document they live in.
   *
   * @param {?object} schedule - A schedule as returned by
   *   formatMonitorForDisplay: { frequency, time: "HH:MM", weekday }
   * @returns {?{id: string, args: object}} Null when there is nothing to state.
   */
  getScheduleL10n(schedule) {
    if (!schedule?.time) {
      return null;
    }
    const [hour, minute] = schedule.time.split(":").map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      return null;
    }

    const id =
      schedule.frequency === SCHEDULE_TYPES.WEEKLY
        ? WEEKLY_SCHEDULE_L10N_IDS[Number(schedule.weekday)]
        : DAILY_SCHEDULE_L10N_ID;
    if (!id) {
      return null;
    }

    // The strings take a datetime, so the time of day is put on today's date.
    const time = new Date();
    time.setHours(hour, minute, 0, 0);
    return { id, args: { time: time.getTime() } };
  },

  /**
   * Open a page a monitor watches, switching to it when it is already open.
   *
   * @param {ChromeWindow} chromeWindow - The window to open the page in
   * @param {string} url - The watched page URL
   * @returns {{success: boolean, error?: string}}
   */
  openMonitorUrl(chromeWindow, url) {
    try {
      if (!url) {
        return { success: false, error: "No URL provided" };
      }

      const uri = Services.io.newURI(url);
      if (uri.scheme !== "http" && uri.scheme !== "https") {
        return { success: false, error: `Unsupported scheme: ${uri.scheme}` };
      }

      if (!chromeWindow) {
        return { success: false, error: "No chrome window" };
      }

      if (
        !lazy.URILoadingHelper.switchToTabHavingURI(
          chromeWindow,
          url,
          false,
          {}
        )
      ) {
        const { userContextId } =
          chromeWindow.gBrowser.selectedBrowser.browsingContext
            .originAttributes;
        lazy.URILoadingHelper.openWebLinkIn(chromeWindow, url, "tab", {
          triggeringPrincipal:
            Services.scriptSecurityManager.createNullPrincipal({
              userContextId,
            }),
          userContextId,
        });
      }

      return { success: true };
    } catch (error) {
      console.error("Failed to open monitor URL:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Resolve page titles for watched URLs from Places so the monitor card can
   * label its chips with the page title.
   *
   * @param {string[]} urls - Watched page URLs
   * @returns {Promise<Record<string, string>>} Map of url → page title for URLs that have a stored title.
   */
  async resolveWatchUrlTitles(urls) {
    const titles = {};
    await Promise.all(
      (urls ?? []).map(async url => {
        try {
          const info = await lazy.PlacesUtils.history.fetch(url);
          if (info?.title) {
            titles[url] = info.title;
          }
        } catch (error) {
          console.error("Places lookup failed for", url, error);
        }
      })
    );
    return titles;
  },

  /**
   * Check whether the user's home region is allowed to use monitors.
   * The allowed regions are read from the
   * `browser.smartwindow.agent.supportedRegions` pref as a comma-separated
   * list of region codes.
   *
   * @returns {boolean} True if the home region is in the supported list
   */
  isMonitorRegionSupported() {
    const supportedRegions = lazy.monitorSupportedRegions
      .split(",")
      .map(region => region.trim().toUpperCase())
      .filter(Boolean);

    const homeRegion = lazy.Region.home?.toUpperCase();
    return Boolean(homeRegion && supportedRegions.includes(homeRegion));
  },
};
