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
  MemoriesManager:
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesManager.sys.mjs",
  renderPrompt: "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs",
  relevantMemoriesContextPrompt:
    "moz-src:///browser/components/aiwindow/models/prompts/MemoriesPrompts.sys.mjs",
});

/**
 * Get the current local time in ISO format with timezone offset.
 *
 * @returns {string}
 */
export function getLocalIsoTime() {
  try {
    const date = new Date();
    const pad = n => String(n).padStart(2, "0");
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
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
    const cachedData = PageDataService.getCached(url);
    if (cachedData?.description) {
      description = cachedData.description;
    } else {
      try {
        const actor =
          browser.browsingContext?.currentWindowGlobal?.getActor("PageData");
        if (actor) {
          const pageData = await actor.collectPageData();
          description = pageData?.description || "";
        }
      } catch (e) {
        console.error(
          "Failed to collect page description data from current tab:",
          e
        );
      }
    }
  }

  return { url, title, description };
}

/**
 * Construct real time information injection message, to be inserted before
 * the memories injection message and the user message in the conversation
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
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
    `Timezone: ${timezone}`,
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

/**
 * Constructs the relevant memories context message to be inejcted before the user message.
 *
 * @param {string} message                                                          User message to find relevant memories for
 * @returns {Promise<null|{role: string, tool_call_id: string, content: string}>}   Relevant memories context message or null if no relevant memories
 */
export async function constructRelevantMemoriesContextMessage(message) {
  const relevantMemories =
    await lazy.MemoriesManager.getRelevantMemories(message);

  // If there are relevant memories, render and return the context message
  if (relevantMemories.length) {
    const relevantMemoriesList =
      "- " +
      relevantMemories
        .map(memory => {
          return memory.memory_summary;
        })
        .join("\n- ");
    const content = await lazy.renderPrompt(
      lazy.relevantMemoriesContextPrompt,
      {
        relevantMemoriesList,
      }
    );

    return {
      role: "system",
      content,
    };
  }
  // If there aren't any relevant memories, return null
  return null;
}

/**
 * Response parsing funtions to detect special tagged information like memories and search terms.
 * Also return the cleaned content after removing all the taggings.
 *
 * @param {string} content
 * @returns {Promise<object>}
 */
export async function parseContentWithTokens(content) {
  const searchRegex = /§search:\s*([^§]+)§/gi;
  const memoriesRegex = /§existing_memory:\s*([^§]+)§/gi;

  const searchTokens = detectTokens(content, searchRegex, "query");
  const memoriesTokens = detectTokens(content, memoriesRegex, "memories");
  // Sort all tokens in reverse index order for easier removal
  const allTokens = [...searchTokens, ...memoriesTokens].sort(
    (a, b) => b.startIndex - a.startIndex
  );

  if (allTokens.length === 0) {
    return {
      cleanContent: content,
      searchQueries: [],
      usedMemories: [],
    };
  }

  // Clean content by removing tagged information
  let cleanContent = content;
  const searchQueries = [];
  const usedMemories = [];

  for (const token of allTokens) {
    if (token.query) {
      searchQueries.unshift(token.query);
    } else if (token.memories) {
      usedMemories.unshift(token.memories);
      // TODO: do we need customEvent to dispatch used memories as we iterate?
    }
    cleanContent =
      cleanContent.slice(0, token.startIndex) +
      cleanContent.slice(token.endIndex);
  }

  return {
    cleanContent: cleanContent.trim(),
    searchQueries,
    usedMemories,
  };
}

/**
 * Given the content and the regex pattern to search, find all occurrence of matches.
 *
 * @param {string} content
 * @param {RegExp} regexPattern
 * @param {string} key
 * @returns {Array<object>}
 */
export function detectTokens(content, regexPattern, key) {
  const matches = [];
  let match;
  while ((match = regexPattern.exec(content)) !== null) {
    matches.push({
      fullMatch: match[0],
      [key]: match[1].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  return matches;
}
