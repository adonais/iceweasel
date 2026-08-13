/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  getRemoteClient,
  selectMainConfig,
  MODEL_PREF,
  FEATURE_MAJOR_VERSIONS,
  MODEL_FEATURES,
  PURPOSES,
  SERVICE_TYPES,
  GENERIC_MODEL_NAME,
  parseVersion,
  checkMajorVersion,
} from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs";
import { openAIEngine } from "moz-src:///browser/components/aiwindow/models/openAIEngine.sys.mjs";
import { Conversation } from "moz-src:///browser/components/aiwindow/models/Conversation.sys.mjs";

const CUSTOM_PROMPTS_PREF = "browser.smartwindow.customPrompts";
const MODEL_CHOICE_PREF = "browser.smartwindow.firstrun.modelChoice";

export const DEFAULT_PURPOSE = "default";
export const FEATURE_PURPOSES = Object.freeze({
  [DEFAULT_PURPOSE]: PURPOSES.CHAT,
  [MODEL_FEATURES.CHAT]: PURPOSES.CHAT,
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_SIDEBAR_STARTER]:
    PURPOSES.CONVERSATION_STARTERS_SIDEBAR,
  [MODEL_FEATURES.CONVERSATION_SUGGESTIONS_FOLLOWUP]:
    PURPOSES.CONVERSATION_STARTERS_SIDEBAR,
  [MODEL_FEATURES.TITLE_GENERATION]: PURPOSES.TITLE_GENERATION,
  [MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM]:
    PURPOSES.MEMORY_GENERATION,
  [MODEL_FEATURES.MEMORIES_MESSAGE_CLASSIFICATION_SYSTEM]:
    PURPOSES.MEMORY_GENERATION,
  [MODEL_FEATURES.AGENT_MONITOR]: PURPOSES.MONITOR,
  [MODEL_FEATURES.SEARCH_ANSWER_GENERATION]: PURPOSES.CHAT,
});

function getDefaultServiceType(feature) {
  if (feature.startsWith("memories")) {
    return SERVICE_TYPES.MEMORIES;
  } else if (feature.startsWith("agent")) {
    return SERVICE_TYPES.AGENT;
  }
  return SERVICE_TYPES.AI;
}

const V2_RECORD_KINDS = new Set(["module", "skill", "params"]);

async function loadV2Records() {
  const records = await getRemoteClient().get();
  return records.filter(r => V2_RECORD_KINDS.has(r.kind));
}

// Numeric value of a record's `version` field ("1.1" -> 1000001); 0 when absent.
function versionOf(record) {
  const version = parseVersion(record.version);
  // set major * 1000000 + minor so that 1.10 > 1.2 and will be fine for all foreseeable versions
  return version ? version.major * 1000000 + version.minor : 0;
}

// Find the module record a manifest entry points to: matching feature+module
// and the entry's MAJOR version (Remote Settings keeps one record per major),
// preferring the model-specific record over generic.
function findModuleAtVersion(records, { feature, module, model, version }) {
  const major = parseVersion(version)?.major;
  const matching = records.filter(
    r =>
      r.kind === "module" &&
      r.feature === feature &&
      r.module === module &&
      parseVersion(r.version)?.major === major
  );
  matching.sort((a, b) => versionOf(b) - versionOf(a));
  return (
    (model && matching.find(r => r.model === model)) ||
    matching.find(r => r.model === GENERIC_MODEL_NAME) ||
    null
  );
}

function findParams(records, { feature, model }) {
  const candidates = records.filter(
    r =>
      r.kind === "params" &&
      r.feature === feature &&
      Array.isArray(r.modules) &&
      checkMajorVersion(r.version, FEATURE_MAJOR_VERSIONS[feature])
  );
  return (
    (model && candidates.find(r => r.model === model)) ||
    candidates.find(r => r.model === GENERIC_MODEL_NAME) ||
    null
  );
}

/**
 * Reads Remote Settings and runs model-selection logic to pick the single
 * config record for a feature. Throws if no records exist for the feature or
 * if no record matches the current major version / model-choice prefs.
 *
 * @param {string} feature - Feature identifier from MODEL_FEATURES
 * @param {object} [opts]
 * @param {number} [opts.majorVersionOverride] - Override the hardcoded major version
 * @param {string} [opts.modelChoiceIdOverride] - Override the user's model-choice pref (used by per-conversation model switching)
 * @returns {Promise<object>} The selected Remote Settings record
 */
async function selectFeatureConfig(feature, opts = {}) {
  const client = getRemoteClient();
  const allRecords = await client.get();

  const featureConfigs = allRecords.filter(r => r.feature === feature);
  if (!featureConfigs.length) {
    const err = new Error(
      `No Remote Settings records found for feature: ${feature}`
    );
    err.clientReason = "remoteSettingsUnavailable";
    throw err;
  }

  const majorVersion =
    opts.majorVersionOverride ?? FEATURE_MAJOR_VERSIONS[feature];
  const userModel = Services.prefs.prefHasUserValue(MODEL_PREF)
    ? Services.prefs.getStringPref(MODEL_PREF, "")
    : "";
  const modelChoiceId =
    opts.modelChoiceIdOverride ??
    Services.prefs.getStringPref(MODEL_CHOICE_PREF, "");

  const mainConfig = selectMainConfig(featureConfigs, {
    majorVersion,
    userModel,
    modelChoiceId,
    feature,
  });

  if (!mainConfig) {
    const err = new Error(
      `No matching model config found for feature: ${feature} with major version ${majorVersion}`
    );
    err.clientReason = "modelConfigUnavailable";
    throw err;
  }

  return mainConfig;
}

/**
 * Resolve the RS record for a feature and build a fresh openAIEngine +
 * inference parameters.
 *
 * @param {string} feature
 * @param {object} [opts]
 * @returns {Promise<{engine: openAIEngine, parameters: object}>}
 */
export async function buildEngineForFeature(feature, opts = {}) {
  const mainConfig = await selectFeatureConfig(feature, opts);

  let parameters = mainConfig.parameters ?? {};
  if (typeof parameters === "string") {
    try {
      parameters = JSON.parse(parameters);
    } catch (_e) {
      parameters = {};
    }
  }
  const serviceType = mainConfig.service_type ?? getDefaultServiceType(feature);
  const purpose =
    mainConfig.purpose ??
    FEATURE_PURPOSES[feature] ??
    FEATURE_PURPOSES[DEFAULT_PURPOSE];

  const modelChoiceId =
    opts.modelChoiceIdOverride ??
    Services.prefs.getStringPref(MODEL_CHOICE_PREF, "");
  const { baseURL, apiKey } = openAIEngine.resolveEndpointConfig(modelChoiceId);

  // resolve the model to use for inference, this allows specific features to default to chat model
  let model = mainConfig.model;
  const CHAT_MODEL_FALLBACK_FEATURES = new Set([MODEL_FEATURES.AGENT_MONITOR]);
  if (
    model === GENERIC_MODEL_NAME &&
    CHAT_MODEL_FALLBACK_FEATURES.has(feature)
  ) {
    const chatConfig = await selectFeatureConfig(MODEL_FEATURES.CHAT, {
      modelChoiceIdOverride: opts.modelChoiceIdOverride,
    });
    model = chatConfig.model;
  }

  const engine = await openAIEngine.build({
    model,
    serviceType,
    purpose,
    flowId: opts.flowId ?? null,
    feature,
    baseURL,
    apiKey,
  });

  return { engine, parameters };
}

/**
 * Build a ready-to-use Conversation for a feature: resolves
 * model/parameters/serviceType/purpose from RS, builds the engine, and
 * returns a fresh Conversation wired to both.
 *
 * @param {string} feature - MODEL_FEATURES.*
 * @param {object} [opts]
 * @param {string|null} [opts.flowId]
 * @param {number} [opts.majorVersionOverride]
 * @param {string} [opts.modelChoiceIdOverride] - Override the user's model-choice pref
 * @returns {Promise<Conversation>}
 */
export async function buildConversation(feature, opts = {}) {
  const { engine, parameters } = await buildEngineForFeature(feature, opts);
  return new Conversation({ feature, engine, parameters });
}

/**
 * Loads the prompt text for a feature. Honors the
 * `browser.smartwindow.customPrompts` pref override.
 *
 * @param {string} feature - Feature identifier from MODEL_FEATURES
 * @param {object} [opts]
 * @param {string} [opts.modelChoiceIdOverride] - Override the user's model-choice pref
 * @returns {Promise<{prompt: string, version: string}>} The prompt text and version
 */
export async function loadPrompt(feature, opts = {}) {
  const customPromptsRaw = Services.prefs.getStringPref(
    CUSTOM_PROMPTS_PREF,
    ""
  );
  if (customPromptsRaw) {
    try {
      const override = JSON.parse(customPromptsRaw)?.[feature];
      if (override) {
        return { prompt: override, version: "" };
      }
    } catch (_e) {
      // invalid JSON — fall through to RS
    }
  }

  if (opts.module) {
    return loadPromptV2(feature, opts);
  }

  const mainConfig = await selectFeatureConfig(feature, opts);
  if (!mainConfig.prompts) {
    const err = new Error(`No prompts field in record for feature: ${feature}`);
    err.clientReason = "promptLoadFailure";
    throw err;
  }
  return { prompt: mainConfig.prompts, version: mainConfig.version };
}

/**
 * Loads the prompt text for a feature from the v2 records.
 *
 * @param {string} feature - Feature identifier from MODEL_FEATURES
 * @param {object} [opts]
 * @returns {Promise<{prompt: string, version: string}>} The prompt text and version
 */
export async function loadPromptV2(feature, opts = {}) {
  // load the records
  const v2Records = await loadV2Records();

  // resolve the model
  const model = opts.model ?? Services.prefs.getStringPref(MODEL_PREF, "");

  // find the params record for the feature+model
  const paramsRecord = findParams(v2Records, {
    feature,
    model,
  });
  if (!paramsRecord) {
    const err = new Error(
      `No matching v2 params record found for feature: ${feature} with model ${model}`
    );
    err.clientReason = "v2ParamsUnavailable";
    throw err;
  }

  // pull the module version from the params record
  const moduleVersion =
    paramsRecord.modules?.find(m => m.name === opts.module)?.version ??
    paramsRecord.version;

  // find the module record for the feature+module+model+version
  const moduleRecord = findModuleAtVersion(v2Records, {
    feature,
    module: opts.module,
    model,
    version: moduleVersion,
  });
  if (!moduleRecord?.prompts) {
    const err = new Error(
      `No matching v2 module record found for feature: ${feature} with module ${opts.module}`
    );
    err.clientReason = "v2ModuleUnavailable";
    throw err;
  }

  return {
    prompt: moduleRecord.prompts.trim(),
    version: moduleVersion,
  };
}
