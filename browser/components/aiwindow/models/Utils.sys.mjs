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
import { getFxAccountsSingleton } from "resource://gre/modules/FxAccounts.sys.mjs";
import {
  OAUTH_CLIENT_ID,
  SCOPE_PROFILE,
} from "resource://gre/modules/FxAccountsCommon.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  RemoteSettings: "resource://services-settings/remote-settings.sys.mjs",
});

const MODEL_PREF = "browser.aiwindow.model";

/**
 * Default engine ID used for all AI Window features
 */
export const DEFAULT_ENGINE_ID = "smart-openai";

/**
 * Service types for different AI Window features
 */
export const SERVICE_TYPES = Object.freeze({
  AI: "ai",
  MEMORIES: "memories",
});

/**
 * Observer for model preference changes.
 * Invalidates the Remote Settings client cache when user changes their model preference.
 */
const modelPrefObserver = {
  observe(_subject, topic, data) {
    if (topic === "nsPref:changed" && data === MODEL_PREF) {
      console.warn(
        "Model preference changed, invalidating Remote Settings cache"
      );
      openAIEngine._remoteClient = null;
    }
  },
};
Services.prefs.addObserver(MODEL_PREF, modelPrefObserver);

/**
 * Feature identifiers for AI Window model, configurations and prompts.
 * These are used to look up model configs, prompts, and inference parameters
 * from Remote Settings or local defaults.
 */
export const MODEL_FEATURES = Object.freeze({
  CHAT: "chat",
  TITLE_GENERATION: "title-generation",
  CONVERSATION_SUGGESTIONS_SIDEBAR_STARTER:
    "conversation-suggestions-sidebar-starter",
  CONVERSATION_SUGGESTIONS_FOLLOWUP: "conversation-suggestions-followup",
  CONVERSATION_SUGGESTIONS_ASSISTANT_LIMITATIONS:
    "conversation-suggestions-assistant-limitations",
  CONVERSATION_SUGGESTIONS_MEMORIES: "conversation-suggestions-memories",
  // TODO: update with actual memories prompts identifiers
  MEMORIES: "memories",
});

/**
 * Default model IDs for each feature.
 * These are Mozilla's recommended models, used when user hasn't configured
 * custom settings or when remote setting retrieval fails.
 */
export const DEFAULT_MODEL = Object.freeze({
  [MODEL_FEATURES.CHAT]: "qwen3-235b-a22b-instruct-2507-maas",
  [MODEL_FEATURES.TITLE_GENERATION]: "qwen3-235b-a22b-instruct-2507-maas",
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_SIDEBAR_STARTER]:
    "qwen3-235b-a22b-instruct-2507-maas",
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_FOLLOWUP]:
    "qwen3-235b-a22b-instruct-2507-maas",
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_ASSISTANT_LIMITATIONS]:
    "qwen3-235b-a22b-instruct-2507-maas",
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_INSIGHTS]:
    "qwen3-235b-a22b-instruct-2507-maas",
  // TODO: update with actual memories default model
  [MODEL_FEATURES.MEMORIES]: "qwen3-235b-a22b-instruct-2507-maas",
});

/**
 * Major version compatibility requirements for each feature.
 * When incrementing a feature's major version:
 * - Update this constant
 * - Ensure Remote Settings has configs for the new major version
 * - Old clients will continue using old major version
 */
export const FEATURE_MAJOR_VERSIONS = Object.freeze({
  [MODEL_FEATURES.CHAT]: 1,
  [MODEL_FEATURES.TITLE_GENERATION]: 1,
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_SIDEBAR_STARTER]: 1,
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_FOLLOWUP]: 1,
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_ASSISTANT_LIMITATIONS]: 1,
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_INSIGHTS]: 1,
  // TODO: add major version for memories prompts
});

/**
 * Remote Settings configuration record structure
 *
 * @typedef {object} RemoteSettingsConfig
 * @property {string} feature - Feature identifier
 * @property {string} model - Model identifier for LLM inference
 * @property {string} prompts - Prompt template content
 * @property {string} version - Version string in "v{major}.{minor}" format
 * @property {boolean} [is_default] - Whether this is the default config for the feature
 * @property {object} [parameters] - Optional inference parameters (e.g., temperature)
 * @property {string[]} [additional_components] - Optional list of dependent feature configs
 */

/**
 * Parses a version string in the format "v{major}.{minor}".
 *
 * @param {string} versionString - Version string to parse (e.g., "v1.2")
 * @returns {object|null} Parsed version with major and minor numbers, or null if invalid
 */
function parseVersion(versionString) {
  const match = /^v(\d+)\.(\d+)$/.exec(versionString || "");
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    original: versionString,
  };
}

/**
 * Selects the main configuration for a feature based on version and model preferences.
 *
 * Remote Settings maintains only the latest minor version for each (feature, model, major_version) combination.
 *
 * Selection logic:
 * 1. Filter to configs matching the required major version
 * 2. If user has model preference, find that model's config
 * 3. Otherwise, find the default config (is_default: true)
 *
 * @param {Array} featureConfigs - All configs for the feature from Remote Settings
 * @param {object} options - Selection options
 * @param {number} options.majorVersion - Required major version for the feature
 * @param {string} options.userModel - User's preferred model (empty string if none)
 * @returns {object|null} Selected config or null if no match
 */
function selectMainConfig(featureConfigs, { majorVersion, userModel }) {
  // Filter to configs matching the required major version
  const sameMajor = featureConfigs.filter(config => {
    const parsed = parseVersion(config.version);
    return parsed && parsed.major === majorVersion;
  });

  if (sameMajor.length === 0) {
    return null;
  }

  // If user specified a model preference, find that model's config
  if (userModel) {
    const userModelConfig = sameMajor.find(
      config => config.model === userModel
    );
    if (userModelConfig) {
      return userModelConfig;
    }
    // User's model not found in this major version - fall through to defaults
    console.warn(
      `User model "${userModel}" not found for major version ${majorVersion}, using default`
    );
  }

  // No user model pref OR user's model not found: use default
  const defaultConfig = sameMajor.find(config => config.is_default === true);
  if (defaultConfig) {
    return defaultConfig;
  }

  // No default found - this shouldn't happen with proper Remote Settings data
  console.warn(`No default config found for major version ${majorVersion}`);
  return null;
}

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

  /**
   *  The Remote Settings collection name for AI window prompt configurations
   */
  static RS_AI_WINDOW_COLLECTION = "ai-window-prompts";

  /**
   * Cached Remote Settings client
   * Cache is invalidated when user changes MODEL_PREF pref via modelPrefObserver
   *
   * @type {RemoteSettingsClient | null}
   */
  static _remoteClient = null;

  /**
   * Configuration map: { featureName: configObject }
   *
   * @type {object | null}
   */
  #configs = null;

  /**
   * Main feature name
   *
   * @type {string | null}
   */
  feature = null;

  /**
   * Resolved model name for LLM inference
   *
   * @type {string | null}
   */
  model = null;

  /**
   * Gets the Remote Settings client for AI window configurations.
   *
   * @returns {RemoteSettingsClient}
   */
  static getRemoteClient() {
    if (openAIEngine._remoteClient) {
      return openAIEngine._remoteClient;
    }

    const client = lazy.RemoteSettings(openAIEngine.RS_AI_WINDOW_COLLECTION, {
      bucketName: "main",
    });

    openAIEngine._remoteClient = client;
    return client;
  }

  /**
   * Applies default configuration fallback when Remote Settings selection fails
   *
   * @param {string} feature - The feature identifier
   * @private
   */
  _applyDefaultConfig(feature) {
    this.feature = feature;
    this.model = DEFAULT_MODEL[feature];
    this.#configs = {};
  }

  /**
   * Loads configuration from Remote Settings with version-aware selection.
   *
   * Selection logic:
   * 1. Filters configs by feature and major version compatibility
   * 2. If user has model preference, finds latest minor for that model
   * 3. Otherwise, finds latest minor among default configs
   * 4. Falls back to latest minor overall if no defaults
   * 5. Falls back to local defaults if no matching major version
   *
   * @param {string} feature - The feature identifier from MODEL_FEATURES
   * @returns {Promise<void>}
   *   Sets this.feature to the feature name
   *   Sets this.model to the selected model ID
   *   Sets this.#configs to contain feature's and additional_components' configs
   */
  async loadConfig(feature) {
    const client = openAIEngine.getRemoteClient();
    const allRecords = await client.get();

    // Filter to configs for this feature
    const featureConfigs = allRecords.filter(
      record => record.feature === feature
    );

    // Fallback to default if no remote settings records for given feature
    if (!featureConfigs.length) {
      console.warn(
        `No Remote Settings records found for feature: ${feature}, using default`
      );
      this._applyDefaultConfig(feature);
      return;
    }

    const majorVersion = FEATURE_MAJOR_VERSIONS[feature];
    const userModel = Services.prefs.getStringPref(MODEL_PREF, "");

    // Find matching config with version and provided userModel pref
    const mainConfig = selectMainConfig(featureConfigs, {
      majorVersion,
      userModel,
    });

    if (!mainConfig) {
      console.warn(
        `No matching model config found for feature: ${feature} with major version ${majorVersion}, using default`
      );
      this._applyDefaultConfig(feature);
      return;
    }

    // Store the selected configuration
    this.feature = feature;
    this.model = mainConfig.model;

    // Build configsMap for looking up additional_components
    const configsMap = new Map(allRecords.map(r => [r.feature, r]));

    // Build configs map: { featureName: configObject }
    this.#configs = {};
    this.#configs[feature] = mainConfig;

    // Add additional_components if exists
    // This field lists what other remote settings configs are needed
    // as dependency to the current feature.
    if (mainConfig.additional_components) {
      for (const componentFeature of mainConfig.additional_components) {
        const componentConfig = configsMap.get(componentFeature);
        if (componentConfig) {
          this.#configs[componentFeature] = componentConfig;
        } else {
          console.warn(
            `Additional component "${componentFeature}" not found in Remote Settings`
          );
        }
      }
    }
  }

  /**
   * Gets the configuration for a specific feature.
   *
   * @param {string} [feature] - The feature identifier. Defaults to the main feature.
   * @returns {object|null} The feature's configuration object
   */
  getConfig(feature) {
    const targetFeature = feature || this.feature;
    return this.#configs?.[targetFeature] || null;
  }

  /**
   * Loads a prompt for the specified feature.
   * Tries Remote Settings first, then falls back to local prompts.
   *
   * @param {string} feature - The feature identifier
   * @returns {Promise<string>} The prompt content
   */
  async loadPrompt(feature) {
    // Try loading from Remote Settings first
    const config = this.getConfig(feature);
    if (config?.prompts) {
      return config.prompts;
    }

    console.warn(
      `No Remote Settings prompt for ${feature}, falling back to local`
    );

    // Fall back to local prompts
    try {
      return await this.#loadLocalPrompt(feature);
    } catch (error) {
      throw new Error(`Failed to load prompt for ${feature}: ${error.message}`);
    }
  }

  /**
   * Loads a prompt from local prompt files.
   *
   * @param {string} feature - The feature identifier
   * @returns {Promise<string>} The prompt content from local files
   */
  async #loadLocalPrompt(feature) {
    switch (feature) {
      case MODEL_FEATURES.CHAT: {
        const { assistantPrompt } = await import(
          "moz-src:///browser/components/aiwindow/models/prompts/AssistantPrompts.sys.mjs"
        );
        return assistantPrompt;
      }
      case MODEL_FEATURES.TITLE_GENERATION: {
        const { titleGenerationPrompt } = await import(
          "moz-src:///browser/components/aiwindow/models/prompts/TitleGenerationPrompts.sys.mjs"
        );
        return titleGenerationPrompt;
      }
      case MODEL_FEATURES.CONVERSATION_SUGGESTIONS_SIDEBAR_STARTER: {
        const { conversationStarterPrompt } = await import(
          "moz-src:///browser/components/aiwindow/models/prompts/ConversationSuggestionsPrompts.sys.mjs"
        );
        return conversationStarterPrompt;
      }
      case MODEL_FEATURES.CONVERSATION_SUGGESTIONS_FOLLOWUP: {
        const { conversationFollowupPrompt } = await import(
          "moz-src:///browser/components/aiwindow/models/prompts/ConversationSuggestionsPrompts.sys.mjs"
        );
        return conversationFollowupPrompt;
      }
      case MODEL_FEATURES.CONVERSATION_SUGGESTIONS_ASSISTANT_LIMITATIONS: {
        const { assistantLimitations } = await import(
          "moz-src:///browser/components/aiwindow/models/prompts/ConversationSuggestionsPrompts.sys.mjs"
        );
        return assistantLimitations;
      }
      case MODEL_FEATURES.CONVERSATION_SUGGESTIONS_MEMORIES: {
        const { conversationMemoriesPrompt } = await import(
          "moz-src:///browser/components/aiwindow/models/prompts/ConversationSuggestionsPrompts.sys.mjs"
        );
        return conversationMemoriesPrompt;
      }
      // TODO: add local memories prompts imports for each feature
      default:
        throw new Error(`No local prompt found for feature: ${feature}`);
    }
  }

  /**
   * Builds an openAIEngine instance with configuration loaded from Remote Settings.
   *
   * @param {string} feature
   *   The feature name to use to retrieve remote settings for prompts.
   * @param {string} engineId
   *   The engine ID for MLEngine creation. Defaults to DEFAULT_ENGINE_ID.
   * @param {string} serviceType
   *   The type of message to be sent ("ai", "memories", "s2s").
   *   Defaults to SERVICE_TYPES.AI.
   * @returns {Promise<object>}
   *   Promise that will resolve to the configured engine instance.
   */
  static async build(
    feature,
    engineId = DEFAULT_ENGINE_ID,
    serviceType = SERVICE_TYPES.AI
  ) {
    const engine = new openAIEngine();

    await engine.loadConfig(feature);

    engine.engineInstance = await openAIEngine.#createOpenAIEngine(
      engineId,
      serviceType,
      engine.model
    );

    return engine;
  }

  /**
   * Retrieves the Firefox account token
   *
   * @returns {Promise<string|null>}   The Firefox account token (string) or null
   */
  static async getFxAccountToken() {
    try {
      const fxAccounts = getFxAccountsSingleton();
      return await fxAccounts.getOAuthToken({
        // Scope needs to be updated in accordance with https://bugzilla.mozilla.org/show_bug.cgi?id=2005290
        scope: SCOPE_PROFILE,
        client_id: OAUTH_CLIENT_ID,
      });
    } catch (error) {
      console.warn("Error obtaining FxA token:", error);
      return null;
    }
  }

  /**
   * Creates an OpenAI engine instance
   *
   * @param {string} engineId     The identifier for the engine instance
   * @param {string} serviceType  The type of message to be sent ("ai", "memories", "s2s")
   * @param {string | null} modelId  The resolved model ID (already contains fallback logic)
   * @returns {Promise<object>}   The configured engine instance
   */
  static async #createOpenAIEngine(engineId, serviceType, modelId = null) {
    const extraHeadersPref = Services.prefs.getStringPref(
      "browser.aiwindow.extraHeaders",
      "{}"
    );
    let extraHeaders = {};
    try {
      extraHeaders = JSON.parse(extraHeadersPref);
    } catch (e) {
      console.error("Failed to parse extra headers from prefs:", e);
      Services.prefs.clearUserPref("browser.aiwindow.extraHeaders");
    }

    try {
      const engineInstance = await openAIEngine._createEngine({
        apiKey: Services.prefs.getStringPref("browser.aiwindow.apiKey", ""),
        backend: "openai",
        baseURL: Services.prefs.getStringPref("browser.aiwindow.endpoint", ""),
        engineId,
        modelId,
        modelRevision: "main",
        taskName: "text-generation",
        serviceType,
        extraHeaders,
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
