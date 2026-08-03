/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { openAIEngine } from "moz-src:///browser/components/aiwindow/models/openAIEngine.sys.mjs";
import { MESSAGE_ROLE } from "moz-src:///browser/components/aiwindow/models/Conversation.sys.mjs";
import {
  toolsConfig,
  toolFns,
  GetPageContent,
  RunSearch,
  GET_OPEN_TABS,
  SEARCH_BROWSING_HISTORY,
  GET_PAGE_CONTENT,
  RUN_SEARCH,
  GET_USER_MEMORIES,
  GET_NAVIGATION_INFO,
  MANAGE_TABS,
  WORLD_CUP_MATCHES,
  WORLD_CUP_LIVE,
  WORLD_CUP_TOOLS,
  WORLD_CUP_PREF,
  SEARCH_THE_WEB,
  RUN_SEARCH_TOOL_CONFIG_VERBATIM_QUERY,
  RUN_SEARCH_TOOL_CONFIG_GENERATED_QUERY,
} from "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs";
import { runSearchTheWeb } from "moz-src:///browser/components/aiwindow/models/search/SearchWorkflow.sys.mjs";

import { expandUrlTokensInToolParams } from "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs";
import { runLLMaJTelemetry } from "moz-src:///browser/components/aiwindow/models/TelemetryUtils.sys.mjs";

/**
 * Execute a specific tool and return the result
 * Exported for testing purposes
 *
 * @param {string} toolName - The name of the tool to execute
 * @param {object} toolParams - The parameters to pass to the tool
 * @param {string} toolCallId - The ID of the tool call
 * @param {ChatConversation} conversation - The conversation context
 * @param {BrowsingContext} browsingContext - The browsing context (can be null for some tools)
 * @param {string} mode - The mode of operation (e.g., "fullpage", "sidebar", "urlbar")
 * @param {number} currentTurn - The current turn number in the conversation
 * @returns {Promise<object>} The result of the tool execution
 * @private
 */
export async function executeToolByName(
  toolName,
  toolParams,
  toolCallId,
  conversation,
  browsingContext,
  mode,
  currentTurn
) {
  let result;
  switch (toolName) {
    case GET_PAGE_CONTENT: {
      const startTime = new Date();
      result = await GetPageContent.getPageContent(toolParams, conversation);
      Glean.smartWindow.getPageContent.record({
        location: mode,
        chat_id: conversation.id,
        message_seq: conversation.messageCount,
        length: result.reduce((acc, curr) => acc + (curr?.length || 0), 0),
        time: new Date() - startTime,
      });
      break;
    }
    case RUN_SEARCH: {
      result = await RunSearch.runSearch(
        toolParams,
        browsingContext,
        conversation
      );
      const engine = await lazy.SearchService.getDefault();
      Glean.smartWindow.searchHandoff.record({
        location: mode,
        chat_id: conversation.id,
        message_seq: conversation.messageCount,
        provider: engine.name ?? "unknown",
        model: conversation.engine?.model,
      });
      conversation._searchExecutedTurn = currentTurn;
      break;
    }
    case GET_OPEN_TABS:
      result = await toolFns.getOpenTabs(conversation);
      break;
    case SEARCH_BROWSING_HISTORY:
      result = await toolFns.searchBrowsingHistory(toolParams, conversation);
      break;
    case GET_USER_MEMORIES:
      result = await toolFns.getUserMemories(conversation);
      break;
    case GET_NAVIGATION_INFO:
      result = await toolFns.getNavigationInfo(toolParams);
      break;
    case MANAGE_TABS: {
      const { toolResult, uiData } = await toolFns.manageTabs(
        toolParams,
        conversation,
        mode,
        conversation.engine?.model,
        toolCallId
      );
      if (uiData) {
        conversation.addUIToolToCurrentMessage(toolCallId, uiData);
      }
      result = toolResult;
      break;
    }
    default: {
      const err = new Error(`No such tool: ${toolName}`);
      err.clientReason = "unknownTool";
      throw err;
    }
  }
  return result;
}

// Hard limit on how many times run_search can execute per conversation turn.
// Prevents infinite tool-call loops when the model repeatedly requests search.
// Bug 2024006.
const MAX_RUN_SEARCH_PER_TURN = 3;

/**
 * Handlers for tools that are feature-gated by a pref and intended to be
 * added or removed independently of the main tool dispatch. Lookups happen
 * before the main switch so each new gated tool does not grow
 * fetchWithHistory's cyclomatic complexity.
 */
const FEATURE_GATED_HANDLERS = new Map([
  [WORLD_CUP_MATCHES, toolFns.worldCupMatches],
  [WORLD_CUP_LIVE, toolFns.worldCupLive],
  [SEARCH_THE_WEB, runSearchTheWeb],
]);

/**
 * Removes any feature-gated tools whose enable pref is currently off, so the
 * model is never offered tools the build is not configured to support.
 *
 * @param {object[]} tools
 * @returns {object[]}
 */
function filterFeatureGatedTools(tools) {
  let filtered = tools;
  if (!Services.prefs.getBoolPref(WORLD_CUP_PREF, false)) {
    filtered = filtered.filter(t => !WORLD_CUP_TOOLS.has(t.function?.name));
  }
  return filtered;
}

/**
 * Per-turn tool-config update after a tool runs. For search_the_web it enforces
 * the one-search-per-turn limit by swapping the tool out, then offers the Google
 * handoff (run_search) so the assistant can fall back at its own discretion. The
 * `could_answer` flag in the returned result is one signal for that decision,
 * not the trigger. A no-op for every other tool, so callers can invoke it
 * unconditionally.
 *
 * @param {string} toolName - The tool that just executed.
 * @param {object[]} chatToolsConfig - The current per-turn tool list.
 * @param {boolean} isVerbatimQuery - Whether the run_search fallback should use
 *   the user's verbatim query (first turn) rather than a model-generated one.
 * @returns {object[]} The updated tool list.
 */
function maybeApplySearchTheWebPostExecution(
  toolName,
  chatToolsConfig,
  isVerbatimQuery
) {
  if (toolName !== SEARCH_THE_WEB) {
    return chatToolsConfig;
  }
  const next = chatToolsConfig.filter(t => t.function?.name !== SEARCH_THE_WEB);
  if (!next.some(t => t.function?.name === RUN_SEARCH)) {
    // Use the verbatim-query variant on the first turn (the user's exact query)
    // and the generated-query variant afterwards.
    next.push(
      structuredClone(
        isVerbatimQuery
          ? RUN_SEARCH_TOOL_CONFIG_VERBATIM_QUERY
          : RUN_SEARCH_TOOL_CONFIG_GENERATED_QUERY
      )
    );
  }
  return next;
}

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AIWindow:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "console", () =>
  console.createInstance({
    prefix: "Conversation",
    maxLogLevelPref: "browser.smartwindow.conversation.logLevel",
  })
);

/**
 * @import { ChatConversation } from "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs"
 */

/**
 * Represents a tool call request from the language model.
 *
 * @typedef {object} ToolCall
 * @property {string} id - e.g. "call_91e28da3a0f4469586aaa01c"
 * @property {"function"} type - Here just "function"
 * @property {{name: string, arguments: unknown }} function - The name and stringified
 *   arguments for the function, e.g. { name: "get_user_memories", arguments: "{}" }
 */

/**
 * Records the smart_window.tool_call Glean event for any tool invocation
 * issued by the assistant. The prompt_version extra captures the Remote
 * Settings prompt configuration version loaded for the chat feature so
 * tool-call behavior can be correlated with prompt revisions during
 * debugging.
 *
 * @param {object} options
 * @param {string} options.toolName
 * @param {"fullpage" | "sidebar" | "urlbar"} options.mode
 * @param {ChatConversation} options.conversation
 * @param {string} options.error - Canonical error code, or "" on success
 */
function recordToolCallEvent({ toolName, mode, conversation, error }) {
  Glean.smartWindow.toolCall.record({
    location: mode,
    chat_id: conversation.id,
    message_seq: conversation.messageCount,
    tool_name: toolName,
    model: conversation.engine?.model,
    prompt_version: conversation.systemPromptVersion,
    error,
  });
}

/**
 * Chat
 */
export const Chat = {};

/**
 * Log chat stream traffic.
 * Automatically formats the output and is controlled by the logLevel pref.
 * Data is wrapped in an array to keep the console output flat and clickable.
 *
 * @param {number} turn
 * @param {string} action
 * @param {object | Array} [data]
 * @param {string} [extraText]
 */
/**
 * Attach a default clientReason to a streaming error if it doesn't already
 * carry classification info we recognize downstream.
 *
 * @param {unknown} err
 */
function classifyStreamingError(err) {
  if (!err || (typeof err !== "object" && typeof err !== "function")) {
    return;
  }
  const hasClassification =
    err.clientReason ||
    "status" in err ||
    err.error ||
    err.metadata?.errorMessage;
  if (!hasClassification) {
    err.clientReason = Services.io.offline ? "offline" : "connectionFailure";
  }
}

function logConversationStream(turn, action, data = null, extraText = "") {
  try {
    let prefix = `[Chat][Turn ${turn}][${action.padEnd(10)}]`;

    if (extraText) {
      prefix += ` ${extraText}`;
    }

    if (data) {
      lazy.console.debug(prefix, [data]);
    } else {
      lazy.console.debug(prefix);
    }
  } catch (err) {
    // Failsafe: If logging ever breaks, print a raw error but DO NOT crash the stream
    lazy.console.error("[Chat] Debug logger failed to format:", err, {
      turn,
      action,
    });
  }
}

Object.assign(Chat, {
  lastUsage: null,

  /**
   * Stream assistant output with tool-call support.
   * Yields assistant text chunks as they arrive. If the model issues tool calls,
   * we execute them locally, append results to the conversation, and continue
   * streaming the model's follow-up answer. Repeats until no more tool calls.
   *
   * @param {object} options
   * @param {ChatConversation} options.conversation
   * @param {BrowsingContext} options.browsingContext - Omitted for tests only.
   * @param {"fullpage" | "sidebar" | "urlbar"} options.mode - See the MODE in ai-window.mjs
   * @param {AbortSignal} [options.signal]
   */
  async fetchWithHistory({ conversation, browsingContext, mode, signal }) {
    if (!browsingContext && !Cu.isInAutomation) {
      const err = new Error(
        "The browsingContext must exist for fetchWithHistory unless we're in automation."
      );
      err.clientReason = "missingBrowsingContext";
      throw err;
    }
    const fxAccountToken = await openAIEngine.getFxAccountToken();
    if (!fxAccountToken) {
      console.error("fetchWithHistory Account Token null or undefined");
      const fxaError = new Error("FxA token unavailable");
      fxaError.clientReason = "fxaTokenUnavailable";
      throw fxaError;
    }

    const currentTurn = conversation.currentTurnIndex();

    /**
     * On the first turn the `run_search` fallback uses the user's verbatim
     * query; later turns use a model-generated query. run_search is not offered
     * up front — it is added by maybeApplySearchTheWebPostExecution after the
     * search flow, using the variant this flag selects.
     */
    const isVerbatimQuery = currentTurn === 0;
    let chatToolsConfig = filterFeatureGatedTools(structuredClone(toolsConfig));

    let fullResponseText = "";
    const searchExecuted = conversation._searchExecutedTurn === currentTurn;
    let blockedSearchAttempts = 0;

    const streamModelResponse = () => {
      const snapshot = conversation.compactChatCompletions();

      lazy.console.log(
        `Request (${conversation.securityProperties.getLogText()})`,
        snapshot.at(-1)
      );

      // Debug logging: Record only the latest message being sent to the model
      logConversationStream(currentTurn, "CHAT SEND", snapshot.at(-1));

      return conversation.runWithGenerator({
        streamOptions: { enabled: true },
        fxAccountToken,
        chatId: conversation.id,
        tool_choice: "auto",
        tools: chatToolsConfig,
        args: snapshot,
        signal,
      });
    };

    while (true) {
      /** @type {ToolCall[] | null} */
      let pendingToolCalls = null;

      ChromeUtils.addProfilerMarker(
        "SmartWindow",
        {},
        "chat-server-request-start"
      );
      const turnStart = ChromeUtils.now();
      try {
        this.lastUsage = null;
        const response = await conversation.receiveResponse(
          streamModelResponse()
        );
        fullResponseText = response.fullResponseText;
        pendingToolCalls = response.pendingToolCalls;

        // Debug logging: Record the raw text and requested tool calls from the model
        logConversationStream(currentTurn, "CHAT RECV", {
          text: fullResponseText,
          toolCalls: pendingToolCalls,
        });

        if (response.usage) {
          this.lastUsage = response.usage;
        }
      } catch (err) {
        console.error("fetchWithHistory streaming error:", err);
        classifyStreamingError(err);
        throw err;
      } finally {
        ChromeUtils.addProfilerMarker(
          "SmartWindow",
          { startTime: turnStart },
          "ServerE2E"
        );
      }

      if (!pendingToolCalls || pendingToolCalls.length === 0) {
        ChromeUtils.addProfilerMarker("SmartWindow", {}, "chat-no-tool-calls");
        // Debug logging: Mark the end of the streaming loop for this turn
        logConversationStream(currentTurn, "STREAM END");
        if (!conversation.engine?.isCustomEndpoint) {
          // We only run telemetry on our own endpoints
          runLLMaJTelemetry(conversation);
        }
        return;
      }

      if (signal?.aborted) {
        logConversationStream(currentTurn, "STREAM END", null, "aborted");
        return;
      }

      // Guard: if the first pending tool call is a duplicate run_search,
      // return an error tool result so the model continues without
      // executing the search or navigating the browser.
      // Bug 2024006: after MAX_RUN_SEARCH_PER_TURN blocked attempts, remove
      // the tool entirely so the model is forced to respond with text.
      // @todo Bug 2006159 - Check all pending tool calls, not just the first
      const firstPending = pendingToolCalls[0]?.function;
      if (firstPending?.name === RUN_SEARCH && searchExecuted) {
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
          conversation.addToolCallMessage(content);
          recordToolCallEvent({
            toolName: tc.function.name,
            mode,
            conversation,
            error: "duplicate_search",
          });
        }

        if (blockedSearchAttempts === MAX_RUN_SEARCH_PER_TURN) {
          chatToolsConfig = chatToolsConfig.filter(
            t => t.function?.name !== RUN_SEARCH
          );
        }
        continue;
      }
      // If the user disabled memories in the last message, the assistant
      // should not be able to retrieve them using the get_user_memories tool
      else if (firstPending?.name === GET_USER_MEMORIES) {
        const lastUserMessage =
          conversation.messages.findLast(m => m.role === MESSAGE_ROLE.USER) ??
          null;
        if (lastUserMessage.memoriesEnabled === false) {
          for (const tc of pendingToolCalls.slice(0, 1)) {
            const content = {
              tool_call_id: tc.id,
              body: "ERROR: get_user_memories tool call error: inform the user that they have disabled memories, so they cannot be retrieved.",
              name: tc.function.name,
            };
            // Append the tool_call BEFORE the error result so the message order
            // satisfies OpenAI's assistant-then-tool sequence.
            conversation.addAssistantMessage("function", {
              tool_calls: [
                {
                  id: tc.id,
                  type: "function",
                  function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments || "{}",
                  },
                },
              ],
            });
            conversation.addToolCallMessage(content);
            recordToolCallEvent({
              toolName: tc.function.name,
              mode,
              conversation,
              error: "memories_disabled",
            });
          }
          continue;
        }
      }

      // @todo Bug 2006159 - Implement parallel tool calling

      // Take the last tool call and ensure the serialized tool calls expand any
      // URL tokens.
      const lastToolCall = structuredClone(pendingToolCalls[0]);
      if (!lastToolCall.function.arguments) {
        // Ensure that the arguments are always present.
        lastToolCall.function.arguments = "{}";
      }
      expandUrlTokensInToolParams(
        lastToolCall.function,
        conversation.tokenToUrl
      );

      conversation.addAssistantMessage("function", {
        tool_calls: [lastToolCall],
      });

      lazy.AIWindow.chatStore?.updateConversation(conversation).catch(() => {});

      ChromeUtils.addProfilerMarker(
        "SmartWindow",
        {},
        `chat-tools-detected(${pendingToolCalls.length})`
      );

      for (const toolCall of pendingToolCalls) {
        const { id, function: functionSpec } = toolCall;
        const toolName = functionSpec?.name || "";
        let toolParams = {};

        ChromeUtils.addProfilerMarker(
          "SmartWindow",
          {},
          `chat-run-tool-start(${toolName})`
        );
        const toolStart = ChromeUtils.now();

        try {
          toolParams = functionSpec?.arguments
            ? JSON.parse(functionSpec.arguments)
            : {};

          expandUrlTokensInToolParams(toolParams, conversation.tokenToUrl);
        } catch (e) {
          ChromeUtils.addProfilerMarker(
            "SmartWindow",
            {},
            `chat-run-tool-error(${toolName}:argument-parse)`
          );
          const content = {
            tool_call_id: id,
            body: { error: "Invalid JSON arguments" },
          };
          conversation.addToolCallMessage(content);
          recordToolCallEvent({
            toolName,
            mode,
            conversation,
            error: "invalid_arguments",
          });
          continue;
        }

        // Make sure we aren't using a generated query when we shouldn't be
        if (
          toolName === RUN_SEARCH &&
          isVerbatimQuery &&
          toolParams.hasOwnProperty("query")
        ) {
          delete toolParams.query;
        }

        // Capture the embedder element before running tools, as navigation during
        // a tool call such as search handoff can replace the browsing context.
        const originalEmbedderElement = browsingContext?.embedderElement;

        // Dispatch the required arguments to different tool calls. Wrap this in a
        // try/catch so the conversation can be updated for failed calls.
        let result;
        let toolCallError = "";
        const featureGatedHandler = FEATURE_GATED_HANDLERS.get(toolName);
        try {
          if (featureGatedHandler) {
            result = await featureGatedHandler(
              toolParams,
              conversation,
              signal
            );
            // One search per turn: swap search_the_web out and offer the Google
            // handoff so the assistant can fall back (no-op for other tools).
            chatToolsConfig = maybeApplySearchTheWebPostExecution(
              toolName,
              chatToolsConfig,
              isVerbatimQuery
            );
          } else {
            result = await executeToolByName(
              toolName,
              toolParams,
              toolCall.id,
              conversation,
              browsingContext,
              mode,
              currentTurn
            );
          }

          // Debug logging: Record the data returned by the tool before feeding it to the model
          logConversationStream(
            currentTurn,
            "TOOL EXEC",
            { arguments: toolParams, result },
            toolName
          );

          ChromeUtils.addProfilerMarker(
            "SmartWindow",
            { startTime: toolStart },
            `chat-run-tool-complete(${toolName})`
          );

          const content = { tool_call_id: id, body: result, name: toolName };
          conversation.addToolCallMessage(content);
        } catch (error) {
          console.error(error);
          toolCallError = "execution_failed";
          result = { error: `Tool execution failed: ${String(error)}` };
          ChromeUtils.addProfilerMarker(
            "SmartWindow",
            { startTime: toolStart },
            `chat-run-tool-error(${toolName})`
          );
          const content = { tool_call_id: id, body: result };
          conversation.addToolCallMessage(content);
        }

        recordToolCallEvent({
          toolName,
          mode,
          conversation,
          error: toolCallError,
        });

        lazy.AIWindow.chatStore
          ?.updateConversation(conversation)
          .catch(() => {});

        // MANAGE_TABS is terminal - UI handles the interaction.
        if (toolName === MANAGE_TABS) {
          conversation.securityProperties.commit();
          return;
        }

        // Perform the search handoff if the RUN_SEARCH tool was run.
        if (toolName === RUN_SEARCH) {
          // Commit here because we return early below and never reach the
          // post-loop commit.
          conversation.securityProperties.commit();
          lazy.console.log(
            `Security commit ${conversation.securityProperties.getLogText()}`
          );

          const win = originalEmbedderElement?.documentGlobal;
          if (!win || win.closed) {
            console.error(
              "run_search: Associated window not available or closed, aborting search handoff"
            );
            return;
          }

          const searchHandoffTab = win.gBrowser.getTabForBrowser(
            originalEmbedderElement
          );
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
      lazy.console.log(
        `Security commit ${conversation.securityProperties.getLogText()}`
      );
    }
  },
});
