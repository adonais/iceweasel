/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MODEL_FEATURES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

add_task(async function test_loadConfig_chat_feature() {
  const engine = new openAIEngine();
  await engine.loadConfig(MODEL_FEATURES.CHAT, 2);
  const config = engine.getConfig(engine.feature);

  info("Loaded config for 'chat' feature:");
  info(`  Model: ${engine.model}`);
  info(`  Feature: ${engine.feature}`);
  if (config) {
    info(`  Config version: ${config.version}`);
    info(`  Config model: ${config.model}`);
    info(`  Has prompts: ${!!config.prompts}`);
    info(`  Prompts: ${config.prompts}`);
  }

  Assert.equal(engine.feature, "chat", "Feature should be set to 'chat'");
  Assert.equal(
    engine.model,
    "qwen3-235b-a22b-instruct-2507-maas",
    "Model should be loaded from remote settings"
  );
  Assert.ok(config, "Config should not be null or undefined");
  Assert.notEqual(
    JSON.stringify(config),
    "{}",
    "Config should not be an empty object"
  );
  Assert.ok(config.prompts?.length, "Prompts should exist and not be empty");
  Assert.equal(
    config.parameters.temperature,
    1.0,
    "Temperature parameter should be loaded"
  );
});

add_task(async function test_loadConfig_with_additional_components() {
  const engine = new openAIEngine();
  await engine.loadConfig(
    MODEL_FEATURES.CONVERSATION_SUGGESTIONS_SIDEBAR_STARTER
  );

  const mainConfig = engine.getConfig(
    MODEL_FEATURES.CONVERSATION_SUGGESTIONS_SIDEBAR_STARTER
  );

  info("Testing additional_components loading:");
  info(`  Main feature: ${engine.feature}`);
  info(`  Model: ${engine.model}`);
  if (mainConfig) {
    info(
      `  Additional components: ${mainConfig.additional_components.join(", ")}`
    );
  }

  Assert.ok(mainConfig, "Main config should be loaded");
  Assert.ok(
    Array.isArray(mainConfig.additional_components),
    "additional_components should be an array"
  );
  Assert.equal(
    mainConfig.additional_components.length,
    3,
    "Should have 3 additional components"
  );

  const limitationsConfig = engine.getConfig(
    "conversation-suggestions-assistant-limitations"
  );
  Assert.ok(
    limitationsConfig,
    "Assistant limitations component should be loaded"
  );
  Assert.ok(
    limitationsConfig.prompts,
    "Assistant limitations should have prompts"
  );

  const memoriesConfig = engine.getConfig("conversation-suggestions-memories");
  Assert.ok(memoriesConfig, "Memories component should be loaded");
  Assert.ok(memoriesConfig.prompts, "Memories should have prompts");

  const systemPromptConfig = engine.getConfig(
    "conversation-starters-sidebar-system"
  );
  Assert.ok(systemPromptConfig, "System prompt component should be loaded");
  Assert.ok(systemPromptConfig.prompts, "System prompt should have prompts");
});
