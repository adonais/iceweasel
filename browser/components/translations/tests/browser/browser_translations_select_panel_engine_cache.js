/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * This test case verifies that short-lived Select Translations clients reuse a
 * cached engine and can create a replacement after that engine is destroyed.
 */
add_task(
  async function test_select_translations_panel_translate_sentence_on_open() {
    const { cleanup, runInPage, resolveDownloads } = await loadTestPage({
      page: SELECT_TEST_PAGE_URL,
      languagePairs: LANGUAGE_PAIRS,
      prefs: [["browser.translations.select.enable", true]],
    });

    await SelectTranslationsTestUtils.openPanel(runInPage, {
      selectFrenchSection: true,
      openAtFrenchSection: true,
      expectedFromLanguage: "fr",
      expectedToLanguage: "en",
      expectedDownloads: 1,
      downloadHandler: resolveDownloads,
      onOpenPanel: SelectTranslationsTestUtils.assertPanelViewTranslated,
    });
    await SelectTranslationsTestUtils.waitForPortToClose();

    await SelectTranslationsTestUtils.clickDoneButton();

    await SelectTranslationsTestUtils.openPanel(runInPage, {
      selectFrenchSentence: true,
      openAtFrenchSentence: true,
      expectedFromLanguage: "fr",
      expectedToLanguage: "en",
      // No downloads because the engine is cached for this language pair.
      onOpenPanel: SelectTranslationsTestUtils.assertPanelViewTranslated,
    });
    await SelectTranslationsTestUtils.waitForPortToClose();

    await SelectTranslationsTestUtils.clickDoneButton();

    info("Explicitly destroying the Translations Engine.");
    await destroyTranslationsEngine();

    await SelectTranslationsTestUtils.openPanel(runInPage, {
      openAtFrenchHyperlink: true,
      expectedFromLanguage: "fr",
      expectedToLanguage: "en",
      // Expect downloads again since the engine was destroyed.
      downloadHandler: resolveDownloads,
      onOpenPanel: SelectTranslationsTestUtils.assertPanelViewTranslated,
    });
    await SelectTranslationsTestUtils.waitForPortToClose();

    await SelectTranslationsTestUtils.clickDoneButton();

    await cleanup();
  }
);

/**
 * This test case covers recreating both the inference process and translations
 * engine after an idle timeout.
 */
add_task(async function test_select_translations_panel_process_idle_timeout() {
  await SelectTranslationsTestUtils.assertTranslationAfterEngineIdleTimeout({
    keepProcessAlive: false,
  });
});

/**
 * This test case covers recreating a translations engine inside an inference
 * process kept alive by another engine actor.
 */
add_task(async function test_select_translations_panel_engine_idle_timeout() {
  await SelectTranslationsTestUtils.assertTranslationAfterEngineIdleTimeout({
    keepProcessAlive: true,
  });
});
