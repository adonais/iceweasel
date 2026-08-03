/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { buildConversation, loadPrompt } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs"
);
const { Conversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Conversation.sys.mjs"
);
const {
  openAIEngine,
  MODEL_FEATURES,
  FEATURE_MAJOR_VERSIONS,
  SERVICE_TYPES,
  PURPOSES,
  _setRemoteClientForTesting,
  _clearRemoteClientForTesting,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const PREF_MODEL = "browser.smartwindow.model";
const PREF_MODEL_CHOICE = "browser.smartwindow.firstrun.modelChoice";
const PREF_CUSTOM_PROMPTS = "browser.smartwindow.customPrompts";

registerCleanupFunction(() => {
  for (const pref of [PREF_MODEL, PREF_MODEL_CHOICE, PREF_CUSTOM_PROMPTS]) {
    if (Services.prefs.prefHasUserValue(pref)) {
      Services.prefs.clearUserPref(pref);
    }
  }
  _clearRemoteClientForTesting();
});

add_task(
  async function test_buildConversation_returns_Conversation_with_engine_and_parameters() {
    Services.prefs.clearUserPref(PREF_MODEL);
    Services.prefs.clearUserPref(PREF_MODEL_CHOICE);
    const sb = sinon.createSandbox();
    try {
      const fakeRecords = [
        {
          feature: MODEL_FEATURES.CHAT,
          version: `${FEATURE_MAJOR_VERSIONS[MODEL_FEATURES.CHAT]}.0`,
          model_choice_id: "",
          model: "gpt-oss-120b",
          is_default: true,
          parameters: { temperature: 0.8 },
          service_type: "ai",
          purpose: "chat",
        },
      ];
      _setRemoteClientForTesting({
        get: sb.stub().resolves(fakeRecords),
      });
      const buildStub = sb
        .stub(openAIEngine, "build")
        .resolves({ marker: "fake-engine" });

      const conversation = await buildConversation(MODEL_FEATURES.CHAT, {
        flowId: "flow-1",
      });

      Assert.ok(
        conversation instanceof Conversation,
        "buildConversation returns a Conversation instance"
      );
      Assert.equal(conversation.feature, MODEL_FEATURES.CHAT);
      Assert.deepEqual(conversation.parameters, { temperature: 0.8 });
      Assert.equal(conversation.engine.marker, "fake-engine");

      Assert.equal(buildStub.callCount, 1);
      Assert.deepEqual(buildStub.firstCall.args[0], {
        model: "gpt-oss-120b",
        serviceType: SERVICE_TYPES.AI,
        purpose: PURPOSES.CHAT,
        flowId: "flow-1",
        feature: MODEL_FEATURES.CHAT,
        baseURL: openAIEngine.endpoint,
        apiKey: "",
      });
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_buildConversation_falls_back_to_defaults_for_non_chat() {
    Services.prefs.clearUserPref(PREF_MODEL);
    Services.prefs.clearUserPref(PREF_MODEL_CHOICE);
    const sb = sinon.createSandbox();
    try {
      const fakeRecords = [
        {
          feature: MODEL_FEATURES.TITLE_GENERATION,
          version: "1.0",
          model: "some-model",
          is_default: true,
        },
      ];
      _setRemoteClientForTesting({
        get: sb.stub().resolves(fakeRecords),
      });
      sb.stub(openAIEngine, "build").resolves({});

      const conversation = await buildConversation(
        MODEL_FEATURES.TITLE_GENERATION
      );
      Assert.deepEqual(conversation.parameters, {});
    } finally {
      sb.restore();
    }
  }
);

add_task(async function test_buildConversation_throws_on_missing_record() {
  const sb = sinon.createSandbox();
  try {
    _setRemoteClientForTesting({
      get: sb.stub().resolves([]),
    });

    await Assert.rejects(
      buildConversation(MODEL_FEATURES.CHAT),
      /No Remote Settings records found for feature/,
      "Should reject when no records exist"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_loadPrompt_returns_prompt_text_and_version() {
  Services.prefs.clearUserPref(PREF_CUSTOM_PROMPTS);
  const sb = sinon.createSandbox();
  try {
    const fakeRecords = [
      {
        feature: MODEL_FEATURES.CHAT,
        version: `${FEATURE_MAJOR_VERSIONS[MODEL_FEATURES.CHAT]}.0`,
        model_choice_id: "",
        model: "gpt-oss-120b",
        is_default: true,
        prompts: "You are a helpful assistant.",
      },
    ];
    _setRemoteClientForTesting({
      get: sb.stub().resolves(fakeRecords),
    });
    const result = await loadPrompt(MODEL_FEATURES.CHAT);

    Assert.deepEqual(result, {
      prompt: "You are a helpful assistant.",
      version: `${FEATURE_MAJOR_VERSIONS[MODEL_FEATURES.CHAT]}.0`,
    });
  } finally {
    sb.restore();
  }
});

add_task(async function test_loadPrompt_throws_on_missing_record() {
  Services.prefs.clearUserPref(PREF_MODEL);
  Services.prefs.clearUserPref(PREF_MODEL_CHOICE);
  Services.prefs.clearUserPref(PREF_CUSTOM_PROMPTS);

  const sb = sinon.createSandbox();
  try {
    _setRemoteClientForTesting({
      get: sb.stub().resolves([]),
    });

    await Assert.rejects(
      loadPrompt(MODEL_FEATURES.CHAT),
      /No Remote Settings records found for feature/,
      "loadPrompt should reject when no records exist"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_loadPrompt_honors_custom_prompt_pref() {
  const sb = sinon.createSandbox();
  try {
    const fakeRecords = [
      {
        feature: MODEL_FEATURES.CHAT,
        version: `${FEATURE_MAJOR_VERSIONS[MODEL_FEATURES.CHAT]}.0`,
        model_choice_id: "",
        model: "gpt-oss-120b",
        is_default: true,
        prompts: "Original prompt.",
      },
    ];
    _setRemoteClientForTesting({
      get: sb.stub().resolves(fakeRecords),
    });
    Services.prefs.setStringPref(
      PREF_CUSTOM_PROMPTS,
      JSON.stringify({ [MODEL_FEATURES.CHAT]: "OVERRIDE" })
    );
    const { prompt } = await loadPrompt(MODEL_FEATURES.CHAT);

    Assert.equal(prompt, "OVERRIDE");
  } finally {
    Services.prefs.clearUserPref(PREF_CUSTOM_PROMPTS);
    sb.restore();
  }
});

add_task(
  async function test_buildConversation_remoteSettingsUnavailable_clientReason() {
    const sb = sinon.createSandbox();
    try {
      _setRemoteClientForTesting({
        get: sb.stub().resolves([]),
      });

      await Assert.rejects(
        buildConversation(MODEL_FEATURES.CHAT),
        err => err.clientReason === "remoteSettingsUnavailable"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_buildConversation_modelConfigUnavailable_clientReason() {
    const sb = sinon.createSandbox();
    try {
      const fakeRecords = [
        {
          feature: MODEL_FEATURES.CHAT,
          version: "999.0",
          model: "generic",
          is_default: true,
        },
      ];
      _setRemoteClientForTesting({
        get: sb.stub().resolves(fakeRecords),
      });

      await Assert.rejects(
        buildConversation(MODEL_FEATURES.CHAT),
        err => err.clientReason === "modelConfigUnavailable"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(async function test_loadPrompt_promptLoadFailure_clientReason() {
  const sb = sinon.createSandbox();
  try {
    const fakeRecords = [
      {
        feature: MODEL_FEATURES.CHAT,
        version: `${FEATURE_MAJOR_VERSIONS[MODEL_FEATURES.CHAT]}.0`,
        model: "generic",
        is_default: true,
      },
    ];
    _setRemoteClientForTesting({
      get: sb.stub().resolves(fakeRecords),
    });

    await Assert.rejects(
      loadPrompt(MODEL_FEATURES.CHAT),
      err => err.clientReason === "promptLoadFailure"
    );
  } finally {
    sb.restore();
  }
});
