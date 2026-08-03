/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { openAIEngine } from "moz-src:///browser/components/aiwindow/models/openAIEngine.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

// Re-exported for back-compat with existing tests that import openAIEngine
// from Utils. New code should import it from openAIEngine.sys.mjs directly.
export { openAIEngine };

export const MODEL_PREF = "browser.smartwindow.model";
const GENERIC_MODEL_NAME = "generic";
const MODEL_CHOICE_PREF = "browser.smartwindow.firstrun.modelChoice";

const RS_AI_WINDOW_COLLECTION = "ai-window-prompts";

const lazy = XPCOMUtils.declareLazy({
  RemoteSettings: "resource://services-settings/remote-settings.sys.mjs",
});

let _remoteClient = null;

/**
 * Gets the Remote Settings client for AI window configurations. Subscribes
 * the model-data cache to RS sync events on first use and caches the client
 * until the model pref changes.
 *
 * @returns {RemoteSettingsClient}
 */
export function getRemoteClient() {
  if (_remoteClient) {
    return _remoteClient;
  }
  const client = lazy.RemoteSettings(RS_AI_WINDOW_COLLECTION, {
    bucketName: "main",
  });
  client.on("sync", async () => {
    try {
      await refreshModelsDataCache();
    } catch (e) {
      console.error("Failed to refresh models cache on sync", e);
    }
  });
  _remoteClient = client;
  return client;
}

/**
 * Test-only seam: install a fake client. Subsequent `getRemoteClient()` calls
 * return it until cleared.
 *
 * @param {object} client
 */
export function _setRemoteClientForTesting(client) {
  _remoteClient = client;
}

/**
 * Test-only seam: clears the cached Remote Settings client.
 */
export function _clearRemoteClientForTesting() {
  _remoteClient = null;
}

const modelPrefObserver = {
  observe(_subject, topic, data) {
    if (topic === "nsPref:changed" && data === MODEL_PREF) {
      console.warn(
        "Model preference changed, invalidating Remote Settings cache"
      );
      _remoteClient = null;
    }
  },
};
Services.prefs.addObserver(MODEL_PREF, modelPrefObserver);

/**
 * Default engine ID used for all AI Window features
 */
export const DEFAULT_ENGINE_ID = "smart-openai";

/**
 * Feature identifiers for AI Window model, configurations and prompts.
 * These are used to look up model configs, prompts, and inference parameters
 * from Remote Settings or local defaults.
 */
export const MODEL_FEATURES = Object.freeze({
  CHAT: "chat",
  TITLE_GENERATION: "title-generation",
  CONVERSATION_STARTERS_SIDEBAR_SYSTEM: "conversation-starters-sidebar-system",
  CONVERSATION_SUGGESTIONS_SIDEBAR_STARTER:
    "conversation-suggestions-sidebar-starter",
  CONVERSATION_SUGGESTIONS_FOLLOWUP: "conversation-suggestions-followup",
  CONVERSATION_SUGGESTIONS_ASSISTANT_LIMITATIONS:
    "conversation-suggestions-assistant-limitations",
  CONVERSATION_SUGGESTIONS_MEMORIES: "conversation-suggestions-memories",
  // memories generation features
  MEMORIES_INITIAL_GENERATION_SYSTEM: "memories-initial-generation-system",
  MEMORIES_INITIAL_GENERATION_USER: "memories-initial-generation-user",
  MEMORIES_QUALITY_AND_SENSITIVITY_FILTER_SYSTEM:
    "memories-quality-and-sensitivity-filter-system",
  MEMORIES_QUALITY_AND_SENSITIVITY_FILTER_USER:
    "memories-quality-and-sensitivity-filter-user",
  MEMORIES_DEDUPLICATION_SYSTEM: "memories-deduplication-system",
  MEMORIES_DEDUPLICATION_USER: "memories-deduplication-user",
  // memories usage features
  MEMORIES_MESSAGE_CLASSIFICATION_SYSTEM:
    "memories-message-classification-system",
  MEMORIES_MESSAGE_CLASSIFICATION_USER: "memories-message-classification-user",
  // real time context
  REAL_TIME_CONTEXT_DATE: "real-time-context-date",
  REAL_TIME_CONTEXT_TAB: "real-time-context-tab",
  REAL_TIME_CONTEXT_MENTIONS: "real-time-context-mentions",
  MEMORIES_RELEVANT_CONTEXT: "memories-relevant-context",
});

/** @typedef {(typeof MODEL_FEATURES)[keyof typeof MODEL_FEATURES]} ModelFeature */

/**
 * Service types for different AI Window features
 */
export const SERVICE_TYPES = Object.freeze({
  AI: "ai",
  MEMORIES: "memories",
});

/**
 * Purposes for different AI Window features, used to track usage and performance in telemetry
 */
export const PURPOSES = Object.freeze({
  CHAT: "chat",
  TITLE_GENERATION: "title-generation",
  CONVERSATION_STARTERS_SIDEBAR: "convo-starters-sidebar",
  MEMORY_GENERATION: "memory-generation",
});

/**
 * Major version compatibility requirements for each feature.
 * When incrementing a feature's major version:
 * - Update this constant
 * - Ensure Remote Settings has configs for the new major version
 * - Old clients will continue using old major version
 *
 * Keep ui/test/browser/head.js MOCK_RS_RECORDS aligned with this table.
 */
export const FEATURE_MAJOR_VERSIONS = Object.freeze({
  [MODEL_FEATURES.CHAT]: 7,
  [MODEL_FEATURES.TITLE_GENERATION]: 1,
  [MODEL_FEATURES.CONVERSATION_STARTERS_SIDEBAR_SYSTEM]: 1,
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_SIDEBAR_STARTER]: 2,
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_FOLLOWUP]: 1,
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_ASSISTANT_LIMITATIONS]: 1,
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_MEMORIES]: 1,
  // memories generation feature versions
  [MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM]: 3,
  [MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_USER]: 3,
  [MODEL_FEATURES.MEMORIES_DEDUPLICATION_SYSTEM]: 1,
  [MODEL_FEATURES.MEMORIES_DEDUPLICATION_USER]: 1,
  [MODEL_FEATURES.MEMORIES_QUALITY_AND_SENSITIVITY_FILTER_SYSTEM]: 1,
  [MODEL_FEATURES.MEMORIES_QUALITY_AND_SENSITIVITY_FILTER_USER]: 1,
  // memories usage feature versions
  [MODEL_FEATURES.MEMORIES_MESSAGE_CLASSIFICATION_SYSTEM]: 1,
  [MODEL_FEATURES.MEMORIES_MESSAGE_CLASSIFICATION_USER]: 1,
  [MODEL_FEATURES.MEMORIES_RELEVANT_CONTEXT]: 2,
  // real-time-context fragments
  [MODEL_FEATURES.REAL_TIME_CONTEXT_DATE]: 1,
  [MODEL_FEATURES.REAL_TIME_CONTEXT_TAB]: 1,
  [MODEL_FEATURES.REAL_TIME_CONTEXT_MENTIONS]: 1,
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
 * @typedef {object} RemoteSettingsClient
 * @property {() => Promise<object[]>} get - Function to get records from remote settings
 */

/**
 * Parses a version string in the format "{major}.{minor}".
 *
 * @param {string} versionString - Version string to parse (e.g., "1.2")
 * @returns {object|null} Parsed version with major and minor numbers, or null if invalid
 */
export function parseVersion(versionString) {
  const match = /^v?(\d+)\.(\d+)$/.exec(versionString || "");
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
 * Verifies that the RS record matches the current Fx build
 *
 * @param {string} recordVersion {majorVersion}.{minorVersion}
 * @param {string} comparisonVersion major version supported by this build
 * @returns {boolean} whether or not major version in recordVersion matches comparisonVersion
 */
export function checkMajorVersion(recordVersion, comparisonVersion) {
  const parsed = parseVersion(recordVersion);
  return parsed && parsed.major == comparisonVersion;
}

/*
 * Fallback model data - matches Remote Settings shape
 * Used when Remote Settings lookup fails
 */
export const FALLBACK_MODELS = {
  0: { model: "custom-model", ownerName: "", labelId: "custom" },
  1: {
    model: "gemini-3.1-flash-lite",
    ownerName: "Google",
    labelId: "fast",
  },
  2: {
    model: "qwen3-235b-a22b-instruct-2507-maas",
    ownerName: "Alibaba",
    labelId: "allpurpose",
  },
  3: {
    model: "gpt-oss-120b",
    ownerName: "OpenAI",
    labelId: "personal",
  },
};

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
 * @param {string} options.modelChoiceId
 * @param {string} options.feature
 * @returns {object|null} Selected config or null if no match
 */
export function selectMainConfig(
  featureConfigs,
  { majorVersion, userModel, modelChoiceId, feature }
) {
  // Filter to configs matching the required major version
  const sameMajor = featureConfigs.filter(config =>
    checkMajorVersion(config.version, majorVersion)
  );

  if (sameMajor.length === 0) {
    console.warn(`Missing featureConfigs for major version ${majorVersion}`);
    return null;
  }

  // We only allow customization of main assistant model ("chat" feature)
  // We figure out which model the user wants and load prompts for that model
  // If we can't find a config for the user selection, we load the generic one
  if (feature === MODEL_FEATURES.CHAT) {
    if (modelChoiceId !== "0") {
      // First check the choice ID. If it's not 0, use the model associated with that ID

      // Look for config based on model choice ID
      const userModelConfig = sameMajor.find(
        config => config.model_choice_id == modelChoiceId
      );
      // Return if we found it
      if (userModelConfig) {
        return userModelConfig;
      }
      // Config for user's model choice ID not found in this major version - fall through to generic
      console.warn(
        `User model choice "${modelChoiceId}" not found for major version ${majorVersion} for feature '${feature}', using generic`
      );
    } else {
      // If the choice ID is 0 or null, check the provided model name

      // Look for config based on the user-provided model name
      // This is the case where the user provides a model name for which we have a fine-tuned prompt
      const userModelConfig = sameMajor.find(
        config => config.model === userModel
      );
      // Return if we found it
      if (userModelConfig) {
        return userModelConfig;
      }
      // Config for user-provided model name not found in this major version - fall through to generic
      console.warn(
        `User model "${userModel}" not found for major version ${majorVersion} for feature '${feature}', using generic`
      );
    }

    // If both cases above failed, load the generic config
    const genericConfig = sameMajor.find(
      config => config.model === GENERIC_MODEL_NAME
    );
    // Inject the user model if one was provided
    // If one wasn't, we return the generic config plain, which will intentionally break inference
    if (userModel) {
      genericConfig.model = userModel;
    }
    return genericConfig;
  }

  // **For all features other than "chat"**
  // If no user model pref OR user's model not found: use default
  const defaultConfig = sameMajor.find(config => config.is_default === true);
  if (defaultConfig) {
    return defaultConfig;
  }

  // No default found - this shouldn't happen with proper Remote Settings data
  console.warn(`No default config found for major version ${majorVersion}`);
  return null;
}

/**
 * Resolves chat model metadata for a given choice ID from Remote Settings.
 *
 * @param {string} choiceId - Model choice ID (e.g., "1", "2", "3")
 * @param {number} [maxMajorVersion] - Maximum major version to include
 * @returns {Promise<{model: string, ownerName: string}|null>}
 *   Returns null if choice ID not found in Remote Settings
 */
export async function resolveChatModelChoice(
  choiceId,
  maxMajorVersion = FEATURE_MAJOR_VERSIONS[MODEL_FEATURES.CHAT]
) {
  if (choiceId === "0") {
    // Custom model - no RS lookup needed
    return {
      model: "custom-model",
      ownerName: "",
    };
  }

  try {
    const client = getRemoteClient();
    const allRecords = await client.get();

    const record = selectMainConfig(
      allRecords.filter(r => r.feature === MODEL_FEATURES.CHAT),
      {
        majorVersion: maxMajorVersion,
        feature: MODEL_FEATURES.CHAT,
        modelChoiceId: choiceId,
      }
    );
    if (!record) {
      return null;
    }

    return {
      model: record.model,
      ownerName: record.owner_name ?? "",
    };
  } catch (error) {
    console.warn(
      "Failed to resolve chat model choice from Remote Settings:",
      error
    );
    return null;
  }
}

/**
 * Gets model metadata for a choice ID, with fallback
 *
 * @param {string} choiceId - Model choice ID (e.g., "1", "2", "3", "0")
 * @returns {Promise<{model: string, ownerName: string}|null>} null if choiceId is falsy
 */
export async function getModelForChoice(choiceId = getCurrentModelChoiceId()) {
  if (!choiceId) {
    return null;
  }

  const labelId = FALLBACK_MODELS[choiceId]?.labelId;
  const resolved = await resolveChatModelChoice(choiceId);
  if (resolved) {
    return { ...resolved, labelId };
  }

  if (choiceId in FALLBACK_MODELS) {
    return FALLBACK_MODELS[choiceId];
  }

  return { model: "unknown", ownerName: "unknown" };
}

/**
 *
 * @type {{[key: string]: {model: string, ownerName: string}}|null}
 * holds model metadata -- this should replace FALLBACK_MODELS where sync calls are needed
 * see getCachedModelsData() below
 */
let _modelsDataCache = null;

export async function refreshModelsDataCache() {
  _modelsDataCache = null;
  await getAllModelsData();
}

/**
 * Gets metadata for all models, with fallback. Result is cached after first call.
 *
 * @returns {Promise<{[key: string]: {model: string, ownerName: string}}>}
 */
export async function getAllModelsData() {
  if (_modelsDataCache) {
    return _modelsDataCache;
  }
  const modelData = { ...FALLBACK_MODELS };
  // RS reads from a local dump. Only the first call sets up RS state,
  // subsequent calls are cached
  const entries = await Promise.all(
    ["1", "2", "3"].map(async id => [id, await getModelForChoice(id)])
  );
  for (const [id, data] of entries) {
    // Preserve labelId from fallback when merging with RS data
    modelData[id] = { ...data, labelId: FALLBACK_MODELS[id]?.labelId };
  }
  _modelsDataCache = modelData;
  return _modelsDataCache;
}

/**
 * Returns cached model data synchronously, or FALLBACK_MODELS if not yet fetched.
 *
 * @returns {{[key: string]: {model: string, ownerName: string}}}
 */
export function getCachedModelsData() {
  return _modelsDataCache ?? FALLBACK_MODELS;
}

export function getCurrentModelName() {
  return getCachedModelsData()[getCurrentModelChoiceId()]?.model ?? "";
}

export function getCurrentModelChoiceId() {
  return Services.prefs.getStringPref(MODEL_CHOICE_PREF, "");
}

/**
 * Clearls ModelsDataCache -- mostly used for testing
 */
export function _clearModelsDataCacheForTesting() {
  _modelsDataCache = null;
}

/**
 * Renders a prompt from a string, replacing placeholders with provided strings.
 *
 * @param {string} rawPromptContent               The raw prompt as a string
 * @param {Map<string, string>} stringsToReplace  A map of placeholder strings to their replacements
 * @returns {Promise<string>}                     The rendered prompt
 */
export function renderPrompt(rawPromptContent, stringsToReplace = {}) {
  let finalPromptContent = rawPromptContent;

  for (const [orig, repl] of Object.entries(stringsToReplace)) {
    const regex = new RegExp(`{${orig}}`, "g");
    finalPromptContent = finalPromptContent.replace(regex, () => repl);
  }

  return finalPromptContent;
}
