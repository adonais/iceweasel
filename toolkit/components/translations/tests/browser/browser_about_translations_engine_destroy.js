/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Manually destroys the engine and verifies that about:translations can
 * translate additional source text with a new engine.
 */
add_task(async function test_about_translations_engine_destroy() {
  const { aboutTranslationsTestUtils, cleanup } = await openAboutTranslations({
    languagePairs: [
      { fromLang: "en", toLang: "fr" },
      { fromLang: "fr", toLang: "en" },
    ],
  });

  const initialSourceText = "Hello world";

  await aboutTranslationsTestUtils.assertEvents(
    {
      expected: [
        [
          AboutTranslationsTestUtils.Events.SourceTextInputDebounced,
          { sourceText: initialSourceText },
        ],
        [
          AboutTranslationsTestUtils.Events.TranslationRequested,
          { translationId: 1 },
        ],
        [AboutTranslationsTestUtils.Events.ShowTranslatingPlaceholder],
      ],
    },
    async () => {
      await aboutTranslationsTestUtils.setSourceLanguageSelectorValue("en");
      await aboutTranslationsTestUtils.setTargetLanguageSelectorValue("fr");
      await aboutTranslationsTestUtils.setSourceTextAreaValue(
        initialSourceText
      );
    }
  );

  await aboutTranslationsTestUtils.assertEvents(
    {
      expected: [
        [
          AboutTranslationsTestUtils.Events.TranslationComplete,
          { translationId: 1 },
        ],
      ],
    },
    async () => {
      await aboutTranslationsTestUtils.resolveDownloads(1);
    }
  );

  await aboutTranslationsTestUtils.assertTranslatedText({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sourceText: initialSourceText,
  });

  info("Destroy the engine process.");
  await destroyTranslationsEngine();

  const updatedSourceText = "Hello again";

  info("Update the source text to trigger a new translation.");
  await aboutTranslationsTestUtils.assertEvents(
    {
      expected: [
        [
          AboutTranslationsTestUtils.Events.SourceTextInputDebounced,
          { sourceText: updatedSourceText },
        ],
        [
          AboutTranslationsTestUtils.Events.URLUpdatedFromUI,
          {
            sourceLanguage: "en",
            targetLanguage: "fr",
            sourceText: updatedSourceText,
          },
        ],
        [
          AboutTranslationsTestUtils.Events.TranslationRequested,
          { translationId: 2 },
        ],
      ],
    },
    async () => {
      await aboutTranslationsTestUtils.setSourceTextAreaValue(
        updatedSourceText
      );
    }
  );

  await aboutTranslationsTestUtils.assertEvents(
    {
      expected: [
        [
          AboutTranslationsTestUtils.Events.TranslationComplete,
          { translationId: 2 },
        ],
      ],
    },
    async () => {
      await aboutTranslationsTestUtils.resolveDownloads(1);
    }
  );

  await aboutTranslationsTestUtils.assertTranslatedText({
    sourceLanguage: "en",
    targetLanguage: "fr",
    sourceText: updatedSourceText,
  });

  await cleanup();
});
