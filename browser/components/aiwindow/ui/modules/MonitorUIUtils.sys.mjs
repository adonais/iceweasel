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
