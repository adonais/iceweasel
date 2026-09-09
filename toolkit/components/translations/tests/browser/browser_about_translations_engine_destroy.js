/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * This test case verifies recovery after an explicit engine shutdown.
 */
add_task(async function test_about_translations_engine_destroy() {
  await AboutTranslationsTestUtils.assertTranslationAfterEngineShutdown({
    async shutdownEngine() {
      info("Explicitly destroy the engine process.");
      await destroyTranslationsEngine();
    },
  });
});

/**
 * This test case covers recreating both the inference process and translations
 * engine after an idle timeout.
 */
add_task(async function test_about_translations_process_idle_timeout() {
  await AboutTranslationsTestUtils.assertTranslationAfterEngineShutdown({
    async shutdownEngine() {
      info("Wait for the engine to shut down after its idle timeout.");
      await TranslationsEngineTestUtils.waitForIdleTimeout({
        sourceLanguage: "en",
        targetLanguage: "fr",
      });
    },
  });
});

/**
 * This test case covers recreating a translations engine inside an inference
 * process kept alive by another engine actor.
 */
add_task(async function test_about_translations_engine_idle_timeout() {
  await AboutTranslationsTestUtils.assertTranslationAfterEngineShutdown({
    keepProcessAlive: true,
    prefs: [["browser.ml.enable", true]],
    async shutdownEngine(engineParent) {
      info(
        "Wait for the translations engine to expire after its idle timeout."
      );
      await TranslationsEngineTestUtils.waitForIdleTimeoutWithProcessAlive(
        engineParent,
        { sourceLanguage: "en", targetLanguage: "fr" }
      );
    },
  });
});
