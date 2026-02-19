/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ToolRoleOpts } from "moz-src:///browser/components/aiwindow/ui/modules/ChatMessage.sys.mjs";
import {
  MODEL_FEATURES,
  openAIEngine,
} from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";
import {
  toolsConfig,
  getOpenTabs,
  searchBrowsingHistory,
  GetPageContent,
} from "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs";

/**
 * Chat
 */
export const Chat = {
  toolMap: {
    get_open_tabs: getOpenTabs,
    search_browsing_history: searchBrowsingHistory,
    get_page_content: GetPageContent.getPageContent.bind(GetPageContent),
  },

  /**
   * Stream assistant output with tool-call support.
   * Yields assistant text chunks as they arrive. If the model issues tool calls,
   * we execute them locally, append results to the conversation, and continue
   * streaming the model’s follow-up answer. Repeats until no more tool calls.
   *
   * @param {ChatConversation} conversation
   * @yields {string} Assistant text chunks
   */
  async *fetchWithHistory(conversation) {
    // Note FXA token fetching disabled for now - this is still in progress
    // We can flip this switch on when more realiable
    const fxAccountToken = await openAIEngine.getFxAccountToken();

    // @todo Bug 2007046
    // Update this with correct model id
    // Move engineInstance initialization up to access engineInstance.model
    const modelId = "qwen3-235b-a22b-instruct-2507-maas";

    const toolRoleOpts = new ToolRoleOpts(modelId);
    const currentTurn = conversation.currentTurnIndex();
    const engineInstance = await openAIEngine.build(MODEL_FEATURES.CHAT);
    const config = engineInstance.getConfig(engineInstance.feature);
    const inferenceParams = config?.parameters || {};

    // Helper to run the model once (streaming) on current convo
    const streamModelResponse = () =>
      engineInstance.runWithGenerator({
        streamOptions: { enabled: true },
        fxAccountToken,
        tool_choice: "auto",
        tools: toolsConfig,
        args: conversation.getMessagesInOpenAiFormat(),
        ...inferenceParams,
      });

    // Keep calling until the model finishes without requesting tools
    while (true) {
      let pendingToolCalls = null;

      // 1) First pass: stream tokens; capture any toolCalls
      for await (const chunk of streamModelResponse()) {
        // Stream assistant text to the UI
        if (chunk?.text) {
          yield chunk.text;
        }

        // Capture tool calls (do not echo raw tool plumbing to the user)
        if (chunk?.toolCalls?.length) {
          pendingToolCalls = chunk.toolCalls;
        }
      }

      // 2) Watch for tool calls; if none, we are done
      if (!pendingToolCalls || pendingToolCalls.length === 0) {
        return;
      }

      // 3) Build the assistant tool_calls message exactly as expected by the API
      //
      // @todo Bug 2006159 - Implement parallel tool calling
      // Temporarily only include the first tool call due to quality issue
      // with subsequent tool call responses, will include all later once above
      // ticket is resolved.
      const tool_calls = pendingToolCalls.slice(0, 1).map(toolCall => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        },
      }));
      conversation.addAssistantMessage("function", { tool_calls });

      // 4) Execute each tool locally and create a tool message with the result
      // TODO: Temporarily only execute the first tool call, will run all later
      for (const toolCall of pendingToolCalls) {
        const { id, function: functionSpec } = toolCall;
        const name = functionSpec?.name || "";
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

        let result;
        try {
          // Call the appropriate tool by name
          const toolFunc = this.toolMap[name];
          if (typeof toolFunc !== "function") {
            throw new Error(`No such tool: ${name}`);
          }

          result = await toolFunc(toolParams);

          // Create special tool call log message to show in the UI log panel
          const content = { tool_call_id: id, body: result };
          conversation.addToolCallMessage(content, currentTurn, toolRoleOpts);
        } catch (e) {
          result = { error: `Tool execution failed: ${String(e)}` };
          const content = { tool_call_id: id, body: result };
          conversation.addToolCallMessage(content, currentTurn, toolRoleOpts);
        }

        // Bug 	2006159 - Implement parallel tool calling, remove after implemented
        break;
      }
    }
  },
};
