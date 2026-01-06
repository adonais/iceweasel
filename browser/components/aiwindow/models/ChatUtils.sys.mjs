/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  PageDataService:
    "moz-src:///browser/components/pagedata/PageDataService.sys.mjs",
});

/**
 * Get the current local time in ISO format with timezone offset.
 *
 * @returns {string}
 */
export function getLocalIsoTime() {
  try {
    const date = new Date();
    const tzOffsetMinutes = date.getTimezoneOffset();
    const adjusted = new Date(date.getTime() - tzOffsetMinutes * 60000)
      .toISOString()
      .slice(0, 19); // Keep up to seconds
    const sign = tzOffsetMinutes <= 0 ? "+" : "-";
    const hours = String(Math.floor(Math.abs(tzOffsetMinutes) / 60)).padStart(
      2,
      "0"
    );
    const minutes = String(Math.abs(tzOffsetMinutes) % 60).padStart(2, "0");
    return `${adjusted}${sign}${hours}:${minutes}`;
  } catch {
    return null;
  }
}

function resolveTabMetadataDependencies(overrides = {}) {
  return {
    BrowserWindowTracker:
      overrides.BrowserWindowTracker ?? lazy.BrowserWindowTracker,
    PageDataService: overrides.PageDataService ?? lazy.PageDataService,
  };
}

/**
 * Get current tab metadata: url, title, description if available.
 *
 * @param {object} [depsOverride]
 * @returns {Promise<{url: string, title: string, description: string}>}
 */
export async function getCurrentTabMetadata(depsOverride) {
  const { BrowserWindowTracker, PageDataService } =
    resolveTabMetadataDependencies(depsOverride);
  const win = BrowserWindowTracker.getTopWindow();
  const browser = win?.gBrowser?.selectedBrowser;
  if (!browser) {
    return { url: "", title: "", description: "" };
  }

  const url = browser.currentURI?.spec || "";
  const title = browser.contentTitle || browser.documentTitle || "";

  let description = "";
  if (url) {
    description =
      PageDataService.getCached(url)?.description ||
      (await PageDataService.fetchPageData(url))?.description ||
      "";
  }

  return { url, title, description };
}

/**
 * Construct real time information injection message, to be inserted before
 * the insights injection message and the user message in the conversation
 * messages list.
 *
 * @param {object} [depsOverride]
 * @returns {Promise<{role: string, content: string}>}
 */
export async function constructRealTimeInfoInjectionMessage(depsOverride) {
  const { url, title, description } = await getCurrentTabMetadata(depsOverride);
  const isoTimestamp = getLocalIsoTime();
  const datePart = isoTimestamp?.split("T")[0] ?? "";
  const locale = Services.locale.appLocaleAsBCP47;
  const hasTabInfo = Boolean(url || title || description);
  const tabSection = hasTabInfo
    ? [
        `Current active browser tab details:`,
        `- URL: ${url}`,
        `- Title: ${title}`,
        `- Description: ${description}`,
      ]
    : [`No active browser tab.`];

  const content = [
    `Below are some real-time context details you can use to inform your response:`,
    `Locale: ${locale}`,
    `Current date & time in ISO format: ${isoTimestamp}`,
    `Today's date: ${datePart || "Unavailable"}`,
    ``,
    ...tabSection,
  ].join("\n");

  return {
    role: "system",
    content,
  };
}
