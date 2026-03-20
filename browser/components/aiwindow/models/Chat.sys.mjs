/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

import { ToolRoleOpts } from "moz-src:///browser/components/aiwindow/ui/modules/ChatMessage.sys.mjs";
import { openAIEngine } from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";
import {
  toolsConfig,
  getOpenTabs,
  searchBrowsingHistory,
  GetPageContent,
  RunSearch,
  getUserMemories,
} from "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs";
import { extractValidUrls } from "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs";
import {
  extractMarkdownLinks,
  validateCitedUrls,
} from "moz-src:///browser/components/aiwindow/models/CitationParser.sys.mjs";

// Hard limit on how many times run_search can execute per conversation turn.
// Prevents infinite tool-call loops when the model repeatedly requests search.
// Bug 2024006.
const MAX_RUN_SEARCH_PER_TURN = 3;

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AIWindow:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
});

/**
 * Chat
 */
export const Chat = {};

XPCOMUtils.defineLazyPreferenceGetter(
  Chat,
  "modelId",
  "browser.smartwindow.model",
  "qwen3-235b-a22b-instruct-2507-maas"
);

Object.assign(Chat, {
  toolMap: {
    get_open_tabs: getOpenTabs,
    search_browsing_history: searchBrowsingHistory,
    get_page_content: GetPageContent.getPageContent,
    run_search: RunSearch.runSearch.bind(RunSearch),
    get_user_memories: getUserMemories,
  },

  /**
   * Stream assistant output with tool-call support.
   * Yields assistant text chunks as they arrive. If the model issues tool calls,
   * we execute them locally, append results to the conversation, and continue
   * streaming the model's follow-up answer. Repeats until no more tool calls.
   *
   * @param {ChatConversation} conversation
   * @param {openAIEngine} engineInstance
   * @param {object} [context]
   * @param {BrowsingContext} [context.browsingContext]
   */
  async fetchWithHistory(conversation, engineInstance, context = {}) {
    const fxAccountToken = await openAIEngine.getFxAccountToken();
    if (!fxAccountToken) {
      console.error("fetchWithHistory Account Token null or undefined");
      const fxaError = new Error("FxA token unavailable");
      fxaError.error = 4; // ACCOUNT_ERROR: triggers FxA sign-in prompt in the UI
      throw fxaError;
    }

    const toolRoleOpts = new ToolRoleOpts(this.modelId);
    const currentTurn = conversation.currentTurnIndex();
    const config = engineInstance.getConfig(engineInstance.feature);
    const inferenceParams = config?.parameters || {};

    /**
     * For the first turn only, we use exactly what the user typed as the `run_search` search query.
     * To make that work, we use a different tool definition for the first turn vs. all subsequent turns.
     */
    let chatToolsConfig = structuredClone(toolsConfig);
    let isVerbatimQuery = true;
    if (currentTurn > 0) {
      chatToolsConfig =
        RunSearch.setGeneratedSearchQueryDescription(chatToolsConfig);
      isVerbatimQuery = false;
    }

    const allAllowedUrls = new Set();
    let fullResponseText = "";
    const searchExecuted = conversation._searchExecutedTurn === currentTurn;
    let blockedSearchAttempts = 0;

    const streamModelResponse = () =>
      engineInstance.runWithGenerator({
        streamOptions: { enabled: true },
        fxAccountToken,
        tool_choice: "auto",
        tools: chatToolsConfig,
        args: conversation.getMessagesInOpenAiFormat(),
        ...inferenceParams,
      });

    while (true) {
      let pendingToolCalls = null;

      try {
        const response = await conversation.receiveResponse(
          streamModelResponse()
        );
        fullResponseText = response.fullResponseText;
        pendingToolCalls = response.pendingToolCalls;
      } catch (err) {
        console.error("fetchWithHistory streaming error:", err);
        throw err;
      }

      if (!pendingToolCalls || pendingToolCalls.length === 0) {
        this._validateCitations(fullResponseText, allAllowedUrls);
        return;
      }

      // Guard: if the first pending tool call is a duplicate run_search,
      // return an error tool result so the model continues without
      // executing the search or navigating the browser.
      // Bug 2024006: after MAX_RUN_SEARCH_PER_TURN blocked attempts, remove
      // the tool entirely so the model is forced to respond with text.
      // @todo Bug 2006159 - Check all pending tool calls, not just the first
      const firstPending = pendingToolCalls[0]?.function;
      if (firstPending?.name === "run_search" && searchExecuted) {
        blockedSearchAttempts++;

        const blockedCalls = pendingToolCalls.slice(0, 1).map(tc => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments || "{}",
          },
        }));
        conversation.addAssistantMessage("function", {
          tool_calls: blockedCalls,
        });

        for (const tc of pendingToolCalls.slice(0, 1)) {
          const content = {
            tool_call_id: tc.id,
            body: "ERROR: run_search tool call error: You may only run one search per user message. Respond to the user with what you have already found and ask if they want you to proceed with the next search. Do not hallucinate search results.",
            name: tc.function.name,
          };
          conversation.addToolCallMessage(content, currentTurn, toolRoleOpts);
        }

        if (blockedSearchAttempts === MAX_RUN_SEARCH_PER_TURN) {
          chatToolsConfig = chatToolsConfig.filter(
            t => t.function?.name !== "run_search"
          );
        }
        continue;
      }

      // @todo Bug 2006159 - Implement parallel tool calling
      const tool_calls = pendingToolCalls.slice(0, 1).map(toolCall => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.function.name,
          arguments: toolCall.function.arguments || "{}",
        },
      }));
      conversation.addAssistantMessage("function", { tool_calls });

      lazy.AIWindow.chatStore?.updateConversation(conversation).catch(() => {});

      for (const toolCall of pendingToolCalls) {
        const { id, function: functionSpec } = toolCall;
        const toolName = functionSpec?.name || "";
        let toolParams = {};

        try {
          toolParams = functionSpec?.arguments
            ? JSON.parse(functionSpec.arguments)
            : {};
        } catch {
          const content = {
            tool_call_id: id,
            body: { error: "Invalid JSON arguments" },
          };
          conversation.addToolCallMessage(content, currentTurn, toolRoleOpts);
          continue;
        }

        // Make sure we aren't using a generated query when we shouldn't be
        if (
          toolName === "run_search" &&
          isVerbatimQuery &&
          toolParams.hasOwnProperty("query")
        ) {
          delete toolParams.query;
        }

        let result, searchHandoffBrowser;
        try {
          const toolFunc = this.toolMap[toolName];
          if (typeof toolFunc !== "function") {
            throw new Error(`No such tool: ${toolName}`);
          }

          const hasParams = toolParams && !!Object.keys(toolParams).length;
          const params = hasParams ? toolParams : undefined;
          const secProps = conversation.securityProperties;

          if (toolName === "run_search") {
            if (!context.browsingContext) {
              console.error(
                "run_search: No browsingContext provided, aborting search handoff"
              );
              return;
            }
            searchHandoffBrowser = context.browsingContext.embedderElement;
            result = await toolFunc(params ?? {}, context, secProps);
            conversation._searchExecutedTurn = currentTurn;
          } else if (toolName === "get_page_content") {
            const startTime = new Date();
            result = await toolFunc(params, undefined, secProps);
            Glean.smartWindow.getPageContent.record({
              location: context?.telemetry?.location,
              chat_id: conversation.id,
              message_seq: conversation.messageCount,
              length: result.reduce(
                (acc, curr) => acc + (curr?.length || 0),
                0
              ),
              time: new Date() - startTime,
            });
          } else {
            result = await toolFunc(params, secProps);
          }

          this._collectAllowedUrlsFromToolCall(
            toolName,
            result,
            allAllowedUrls
          );

          const content = { tool_call_id: id, body: result, name: toolName };
          conversation.addToolCallMessage(content, currentTurn, toolRoleOpts);
        } catch (e) {
          result = { error: `Tool execution failed: ${String(e)}` };
          const content = { tool_call_id: id, body: result };
          conversation.addToolCallMessage(content, currentTurn, toolRoleOpts);
        }

        lazy.AIWindow.chatStore
          ?.updateConversation(conversation)
          .catch(() => {});

        if (toolName === "run_search") {
          // Commit here because we return early below and never reach the
          // post-loop commit.
          conversation.securityProperties.commit();

          const win = searchHandoffBrowser?.ownerGlobal;
          if (!win || win.closed) {
            console.error(
              "run_search: Associated window not available or closed, aborting search handoff"
            );
            return;
          }

          const searchHandoffTab =
            win.gBrowser.getTabForBrowser(searchHandoffBrowser);
          if (!searchHandoffTab) {
            console.error(
              "run_search: Original tab no longer exists, aborting search handoff"
            );
            return;
          }
          if (!searchHandoffTab.selected) {
            win.gBrowser.selectedTab = searchHandoffTab;
          }

          lazy.AIWindow.openSidebarAndContinue(win, conversation);
          return;
        }

        // @todo Bug 2006159 - Implement parallel tool calling
        break;
      }

      // Commit flags once all tool calls in this batch have finished so that
      // no tool call can observe flags staged by a sibling call.
      conversation.securityProperties.commit();
    }
  },

  /**
   * Collect allowed URLs from tool results for citation validation.
   *
   * @param {string} toolName - Name of the tool
   * @param {*} result - Tool result
   * @param {Set<string>} allAllowedUrls - Set to add URLs to
   */
  _collectAllowedUrlsFromToolCall(toolName, result, allAllowedUrls) {
    if (toolName === "get_open_tabs" && Array.isArray(result)) {
      for (const url of extractValidUrls(result)) {
        allAllowedUrls.add(url);
      }
    } else if (toolName === "search_browsing_history") {
      let parsed = result;
      if (typeof result === "string") {
        try {
          parsed = JSON.parse(result);
        } catch {
          return;
        }
      }
      if (parsed?.results && Array.isArray(parsed.results)) {
        for (const url of extractValidUrls(parsed.results)) {
          allAllowedUrls.add(url);
        }
      }
    }
  },

  /**
   * Validate citations in the response against allowed URLs.
   *
   * @param {string} responseText - Full response text
   * @param {Set<string>} allAllowedUrls - Set of allowed URLs
   */
  _validateCitations(responseText, allAllowedUrls) {
    if (!responseText) {
      return null;
    }

    const links = extractMarkdownLinks(responseText);
    if (links.length === 0) {
      return null;
    }

    const citedUrls = links.map(link => link.url);

    if (allAllowedUrls.size === 0) {
      console.warn(
        `Citation validation: 0 valid, ${citedUrls.length} invalid ` +
          `(no tool sources provided)`
      );
      return null;
    }

    const validation = validateCitedUrls(citedUrls, [...allAllowedUrls]);

    if (validation.invalid.length) {
      console.warn(
        `Citation validation: ${validation.valid.length} valid, ` +
          `${validation.invalid.length} invalid (rate: ${(validation.validationRate * 100).toFixed(1)}%)`
      );
    }

    return validation;
  },
});
