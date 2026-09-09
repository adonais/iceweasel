/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { buildConversation, loadPrompt } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs"
);

const { Conversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Conversation.sys.mjs"
);

/**
 * @type {import("../AIWindowTestUtils.sys.mjs")}
 */
const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const {
  MODEL_FEATURES,
  SERVICE_TYPES,
  PURPOSES,
  getRemoteClient,
  checkMajorVersion,
  FEATURE_MAJOR_VERSIONS,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const PREF_MODEL = "browser.smartwindow.model";
const PREF_MODEL_CHOICE = "browser.smartwindow.firstrun.modelChoice";
const PREF_ENDPOINT = "browser.smartwindow.endpoint";
const PREF_CUSTOM_ENDPOINT = "browser.smartwindow.customEndpoint";
const PREF_CUSTOM_PROMPTS = "browser.smartwindow.customPrompts";

const CUSTOM_MODEL = "test-local-model:latest";
const CUSTOM_ENDPOINT = "http://localhost:1/v1";

let gChatParamsByChoice;
let gTitleGenerationConfig;
let gMemoriesGenerationConfig;

function parametersOf(record) {
  return typeof record.parameters === "string"
    ? JSON.parse(record.parameters)
    : record.parameters || {};
}

add_setup(async function read_real_config_records() {
  const records = await getRemoteClient().get();
  gChatParamsByChoice = new Map(
    records
      .filter(
        record =>
          record.kind === "params" &&
          record.feature === MODEL_FEATURES.CHAT &&
          record.model_choice_id
      )
      .map(record => [record.model_choice_id, record])
  );
  gTitleGenerationConfig = records.find(
    record =>
      !record.kind &&
      record.feature === MODEL_FEATURES.TITLE_GENERATION &&
      record.is_default
  );

  const memoriesFeature = MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM;
  gMemoriesGenerationConfig = records.find(
    record =>
      !record.kind &&
      record.feature === memoriesFeature &&
      record.is_default &&
      checkMajorVersion(record.version, FEATURE_MAJOR_VERSIONS[memoriesFeature])
  );

  Assert.ok(gChatParamsByChoice.get("1"), "Real RS has model choice 1 params");
  Assert.ok(gChatParamsByChoice.get("2"), "Real RS has model choice 2 params");
  Assert.ok(gTitleGenerationConfig, "Real RS has title-generation config");
  Assert.ok(
    gMemoriesGenerationConfig,
    "Real RS has memories-initial-generation-system config"
  );
  Assert.notEqual(
    gMemoriesGenerationConfig.model,
    CUSTOM_MODEL,
    "Memories config is pinned to a model that is not the custom one"
  );
});

add_task(async function test_buildConversation_uses_chat_params() {
  const expectedParams = gChatParamsByChoice.get("2");
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_MODEL_CHOICE, "2"]],
    clear: [[PREF_MODEL], [PREF_ENDPOINT], [PREF_CUSTOM_ENDPOINT]],
  });

  try {
    const conversation = await buildConversation(MODEL_FEATURES.CHAT, {
      flowId: "test-flow",
    });

    Assert.ok(
      conversation instanceof Conversation,
      "buildConversation returns a Conversation instance"
    );
    Assert.equal(conversation.feature, MODEL_FEATURES.CHAT);
    Assert.deepEqual(conversation.parameters, parametersOf(expectedParams));
    Assert.equal(conversation.engine.model, expectedParams.model);
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_buildConversation_uses_non_chat_config() {
  await SpecialPowers.pushPrefEnv({
    clear: [[PREF_MODEL], [PREF_MODEL_CHOICE], [PREF_ENDPOINT]],
  });

  try {
    const conversation = await buildConversation(
      MODEL_FEATURES.TITLE_GENERATION
    );

    Assert.equal(conversation.feature, MODEL_FEATURES.TITLE_GENERATION);
    Assert.deepEqual(conversation.parameters, {});
    Assert.equal(conversation.engine.model, gTitleGenerationConfig.model);
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_buildConversation_custom_model_for_non_chat() {
  const createEngineSpy = sinon.spy(openAIEngine, "_createEngine");
  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_MODEL_CHOICE, "0"],
      [PREF_CUSTOM_ENDPOINT, CUSTOM_ENDPOINT],
      [PREF_MODEL, CUSTOM_MODEL],
    ],
  });

  try {
    const feature = MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM;
    const conversation = await buildConversation(feature);

    Assert.equal(
      conversation.engine.model,
      CUSTOM_MODEL,
      "A non-chat feature sends the custom model, not the record's model"
    );

    // Check v1 non-chat prompts respect the custom endpoint
    const { prompt, version } = await loadPrompt(feature);
    Assert.equal(
      version,
      gMemoriesGenerationConfig.version,
      "The prompt still comes from the Remote Settings record"
    );
    Assert.ok(prompt.length, "Prompt is not empty");

    // memories-merge is a v2 prompt
    const merge = await loadPrompt(MODEL_FEATURES.MEMORIES_MERGE, {
      module: "system-instructions",
      model: CUSTOM_MODEL,
    });
    Assert.ok(
      merge.prompt.length,
      "Modular prompts resolve for a model no record is keyed on"
    );

    // Check the engine points at the custom model and endpoint
    Assert.equal(
      createEngineSpy.lastCall.args[0].modelId,
      CUSTOM_MODEL,
      "The engine is configured with the custom model"
    );
    Assert.equal(
      createEngineSpy.lastCall.args[0].baseURL,
      CUSTOM_ENDPOINT,
      "The engine is pointed at the custom endpoint"
    );
  } finally {
    await SpecialPowers.popPrefEnv();
    createEngineSpy.restore();
  }
});

add_task(async function test_buildConversation_preset_choice_ignores_model() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_MODEL_CHOICE, "2"],
      [PREF_MODEL, CUSTOM_MODEL],
    ],
    clear: [[PREF_ENDPOINT], [PREF_CUSTOM_ENDPOINT]],
  });

  try {
    const conversation = await buildConversation(
      MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM
    );

    Assert.equal(
      conversation.engine.model,
      gMemoriesGenerationConfig.model,
      "A preset model choice keeps the record's model"
    );
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_loadPrompt_uses_non_chat_prompt() {
  await SpecialPowers.pushPrefEnv({
    clear: [[PREF_CUSTOM_PROMPTS], [PREF_MODEL], [PREF_MODEL_CHOICE]],
  });

  try {
    const result = await loadPrompt(MODEL_FEATURES.TITLE_GENERATION);

    Assert.equal(result.version, gTitleGenerationConfig.version);
    Assert.ok(
      result.prompt.startsWith(gTitleGenerationConfig.prompts.split("\n")[0]),
      "Title generation prompt loaded from Remote Settings"
    );
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_loadPrompt_honors_custom_prompt_pref() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        PREF_CUSTOM_PROMPTS,
        JSON.stringify({ [MODEL_FEATURES.CHAT]: "OVERRIDE" }),
      ],
    ],
  });

  try {
    const { prompt, version } = await loadPrompt(MODEL_FEATURES.CHAT);

    Assert.equal(prompt, "OVERRIDE");
    Assert.equal(version, "");
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_buildConversation_reports_missing_feature() {
  await Assert.rejects(
    buildConversation("not-a-real-feature"),
    err => err.clientReason === "remoteSettingsUnavailable"
  );
});

add_task(async function test_buildConversation_reports_missing_major_version() {
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_MODEL_CHOICE, "2"]],
    clear: [[PREF_MODEL]],
  });

  try {
    await Assert.rejects(
      buildConversation(MODEL_FEATURES.CHAT, { majorVersionOverride: 999 }),
      err => err.clientReason === "modelConfigUnavailable"
    );
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});
