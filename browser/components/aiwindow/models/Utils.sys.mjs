/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * This module defines utility functions and classes needed for invoking LLMs such as:
 * - Creating and running OpenAI engine instances
 * - Rendering prompts from files
 */

import { createEngine } from "chrome://global/content/ml/EngineProcess.sys.mjs";

/**
 * openAIEngine class
 *
 * Contains methods to create engine instances and estimate token usage.
 */
export class openAIEngine {
  /**
   * Exposing createEngine for testing purposes.
   */
  static _createEngine = createEngine;

  static async build(engineId = "smart-openai") {
    const engine = new openAIEngine();
    engine.engineInstance = await openAIEngine.#createOpenAIEngine(engineId);
    return engine;
  }

  /**
   * Creates an OpenAI engine instance
   *
   * @param {string} engineId   The identifier for the engine instance
   * @returns {Promise<object>} The configured engine instance
   */
  static async #createOpenAIEngine(engineId) {
    try {
      const engineInstance = await openAIEngine._createEngine({
        apiKey: Services.prefs.getStringPref("browser.aiwindow.apiKey"),
        backend: "openai",
        baseURL: Services.prefs.getStringPref("browser.aiwindow.endpoint"),
        engineId,
        modelId: Services.prefs.getStringPref("browser.aiwindow.model"),
        modelRevision: "main",
        taskName: "text-generation",
      });
      return engineInstance;
    } catch (error) {
      console.error("Failed to create OpenAI engine:", error);
      throw error;
    }
  }

  /**
   * Wrapper around engine.run to send message to the LLM
   * Will eventually use `usage` from the LiteLLM API response for token telemetry
   *
   * @param {Map<string, any>} content  OpenAI formatted messages to be sent to the LLM
   * @returns {object}                  LLM response
   */
  async run(content) {
    return await this.engineInstance.run(content);
  }

  /**
   * Wrapper around engine.runWithGenerator to send message to the LLM
   * Will eventually use `usage` from the LiteLLM API response for token telemetry
   *
   * @param {Map<string, any>} options  OpenAI formatted messages with streaming and tooling options to be sent to the LLM
   * @returns {object}                  LLM response
   */
  runWithGenerator(options) {
    return this.engineInstance.runWithGenerator(options);
  }
}

/**
 * Renders a prompt from a string, replacing placeholders with provided strings.
 *
 * @param {string} rawPromptContent               The raw prompt as a string
 * @param {Map<string, string>} stringsToReplace  A map of placeholder strings to their replacements
 * @returns {Promise<string>}                     The rendered prompt
 */
export async function renderPrompt(rawPromptContent, stringsToReplace = {}) {
  let finalPromptContent = rawPromptContent;

  for (const [orig, repl] of Object.entries(stringsToReplace)) {
    const regex = new RegExp(`{${orig}}`, "g");
    finalPromptContent = finalPromptContent.replace(regex, repl);
  }

  return finalPromptContent;
}
