/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { openAIEngine, MODEL_FEATURES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const PREF_API_KEY = "browser.aiwindow.apiKey";
const PREF_ENDPOINT = "browser.aiwindow.endpoint";
const PREF_MODEL = "browser.aiwindow.model";

const API_KEY = "fake-key";
const ENDPOINT = "https://api.fake-endpoint.com/v1";

async function loadRemoteSettingsSnapshot() {
  const file = do_get_file("ai-window-prompts-remote-settings-snapshot.json");
  const data = await IOUtils.readUTF8(file.path);
  return JSON.parse(data);
}

let REAL_REMOTE_SETTINGS_SNAPSHOT;

add_setup(async function () {
  REAL_REMOTE_SETTINGS_SNAPSHOT = await loadRemoteSettingsSnapshot();
});

registerCleanupFunction(() => {
  for (let pref of [PREF_API_KEY, PREF_ENDPOINT, PREF_MODEL]) {
    if (Services.prefs.prefHasUserValue(pref)) {
      Services.prefs.clearUserPref(pref);
    }
  }
});

add_task(async function test_loadConfig_basic_with_real_snapshot() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      runWithGenerator() {
        throw new Error("not used");
      },
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    sb.stub(openAIEngine, "getRemoteClient").returns({
      get: sb.stub().resolves(REAL_REMOTE_SETTINGS_SNAPSHOT),
    });

    const engine = new openAIEngine();

    await engine.loadConfig(MODEL_FEATURES.CHAT);

    Assert.equal(
      engine.feature,
      MODEL_FEATURES.CHAT,
      "Feature should be set correctly"
    );
    Assert.ok(engine.model, "Model should be loaded from remote settings");

    const config = engine.getConfig(MODEL_FEATURES.CHAT);
    Assert.ok(config, "Config should be loaded");
    Assert.ok(config.prompts, "Prompts should be loaded from remote settings");
    Assert.ok(
      config.prompts.includes("browser assistant"),
      "Prompts should contain expected content"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_loadConfig_with_user_pref_model() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, "gpt-oss-120b");

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      runWithGenerator() {
        throw new Error("not used");
      },
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    sb.stub(openAIEngine, "getRemoteClient").returns({
      get: sb.stub().resolves(REAL_REMOTE_SETTINGS_SNAPSHOT),
    });

    const engine = new openAIEngine();

    await engine.loadConfig(MODEL_FEATURES.CHAT);

    Assert.equal(
      engine.model,
      "gpt-oss-120b",
      "User pref model should filter to matching configs"
    );
    const config = engine.getConfig(MODEL_FEATURES.CHAT);
    Assert.equal(
      config.model,
      "gpt-oss-120b",
      "Selected config should be for user's preferred model"
    );
  } finally {
    sb.restore();
    Services.prefs.clearUserPref(PREF_MODEL);
  }
});

add_task(async function test_loadConfig_no_records() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      runWithGenerator() {
        throw new Error("not used");
      },
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    sb.stub(openAIEngine, "getRemoteClient").returns({
      get: sb.stub().resolves([]),
    });

    const engine = new openAIEngine();

    await engine.loadConfig(MODEL_FEATURES.CHAT);

    Assert.equal(
      engine.model,
      "qwen3-235b-a22b-instruct-2507-maas",
      "Should fall back to default model when remote settings returns no records"
    );
    Assert.equal(
      engine.feature,
      MODEL_FEATURES.CHAT,
      "Should set feature when remote settings returns no records"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_loadConfig_filters_by_major_version() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      runWithGenerator() {
        throw new Error("not used");
      },
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    // Add a v2.0 record to test data
    const recordsWithV2 = [
      ...REAL_REMOTE_SETTINGS_SNAPSHOT,
      {
        model: "future-model",
        feature: "chat",
        prompts: "Future version prompt",
        version: "v2.0",
        is_default: true,
      },
    ];

    sb.stub(openAIEngine, "getRemoteClient").returns({
      get: sb.stub().resolves(recordsWithV2),
    });

    const engine = new openAIEngine();
    await engine.loadConfig(MODEL_FEATURES.CHAT);

    const config = engine.getConfig(MODEL_FEATURES.CHAT);
    // Should get v1.x, not v2.0
    Assert.ok(config.version.startsWith("v1."), "Should select v1.x, not v2.0");
  } finally {
    sb.restore();
  }
});

add_task(async function test_loadConfig_fallback_when_user_model_not_found() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, "nonexistent-model");

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      runWithGenerator() {
        throw new Error("not used");
      },
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    sb.stub(openAIEngine, "getRemoteClient").returns({
      get: sb.stub().resolves(REAL_REMOTE_SETTINGS_SNAPSHOT),
    });

    const engine = new openAIEngine();
    await engine.loadConfig(MODEL_FEATURES.CHAT);

    // Should fall back to default model
    Assert.notEqual(
      engine.model,
      "nonexistent-model",
      "Should not use invalid user model"
    );
    const config = engine.getConfig(MODEL_FEATURES.CHAT);
    Assert.equal(config.is_default, true, "Should fall back to default config");
    Assert.equal(
      config.model,
      engine.model,
      "Engine model should match the default config's model"
    );
    Assert.equal(config.version, "v1.0", "Should use v1.0");
  } finally {
    sb.restore();
    Services.prefs.clearUserPref(PREF_MODEL);
  }
});

add_task(async function test_loadPrompt_from_remote_settings() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      runWithGenerator() {
        throw new Error("not used");
      },
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    sb.stub(openAIEngine, "getRemoteClient").returns({
      get: sb.stub().resolves(REAL_REMOTE_SETTINGS_SNAPSHOT),
    });

    const engine = new openAIEngine();
    await engine.loadConfig(MODEL_FEATURES.TITLE_GENERATION);

    const prompt = await engine.loadPrompt(MODEL_FEATURES.TITLE_GENERATION);

    Assert.ok(prompt, "Prompt should be loaded from remote settings");
    Assert.ok(
      prompt.includes("title") || prompt.includes("conversation"),
      "Prompt should contain expected content for title generation"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_loadPrompt_fallback_to_local() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      runWithGenerator() {
        throw new Error("not used");
      },
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    sb.stub(openAIEngine, "getRemoteClient").returns({
      get: sb.stub().resolves([]),
    });

    const engine = new openAIEngine();
    await engine.loadConfig(MODEL_FEATURES.TITLE_GENERATION);

    const prompt = await engine.loadPrompt(MODEL_FEATURES.TITLE_GENERATION);

    Assert.ok(prompt, "Prompt should fallback to local prompt");
    Assert.ok(
      prompt.includes("Generate a concise chat title"),
      "Should load local prompt when remote settings has no config"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_build_with_feature() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      runWithGenerator() {
        throw new Error("not used");
      },
    };
    const createEngineStub = sb
      .stub(openAIEngine, "_createEngine")
      .resolves(fakeEngine);

    sb.stub(openAIEngine, "getRemoteClient").returns({
      get: sb.stub().resolves(REAL_REMOTE_SETTINGS_SNAPSHOT),
    });

    const engine = await openAIEngine.build(MODEL_FEATURES.CHAT);

    Assert.ok(engine.engineInstance, "Engine instance should be created");
    Assert.equal(engine.feature, MODEL_FEATURES.CHAT, "Feature should be set");
    Assert.ok(engine.model, "Model should be loaded from remote settings");

    const opts = createEngineStub.firstCall.args[0];
    Assert.ok(opts.modelId, "Model should be passed to engine creation");
    Assert.equal(
      opts.modelId,
      engine.model,
      "Model passed to engine should match loaded model"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_inference_params_from_config() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      runWithGenerator() {
        throw new Error("not used");
      },
    };
    sb.stub(openAIEngine, "_createEngine").resolves(fakeEngine);

    sb.stub(openAIEngine, "getRemoteClient").returns({
      get: sb.stub().resolves(REAL_REMOTE_SETTINGS_SNAPSHOT),
    });

    const engine = new openAIEngine();
    await engine.loadConfig(MODEL_FEATURES.CHAT);

    const config = engine.getConfig(MODEL_FEATURES.CHAT);
    Assert.ok(config, "Config should be loaded");

    const inferenceParams = config?.parameters || {};
    Assert.equal(
      typeof inferenceParams,
      "object",
      "Inference parameters should be an object"
    );
    Assert.equal(
      inferenceParams.temperature,
      1.0,
      "Temperature should be loaded from parameters"
    );
  } finally {
    sb.restore();
  }
});
