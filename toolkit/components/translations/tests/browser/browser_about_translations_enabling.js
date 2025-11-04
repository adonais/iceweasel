/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Checks that nothing appears when the global Translations pref is disabled.
 */
add_task(async function test_about_translations_disabled() {
  const { aboutTranslationsTestUtils, cleanup } = await openAboutTranslations({
    disabled: true,
    autoDownloadFromRemoteSettings: true,
  });

  await aboutTranslationsTestUtils.assertIsVisible({
    pageHeader: false,
    mainUserInterface: false,
    sourceLanguageSelector: false,
    targetLanguageSelector: false,
    swapLanguagesButton: false,
    sourceTextArea: false,
    targetTextArea: false,
    unsupportedInfoMessage: false,
    languageLoadErrorMessage: false,
  });

  await cleanup();
});

/**
 * Checks that the page loads correctly when the global Translations pref is enabled.
 */
add_task(async function test_about_translations_enabled() {
  const { aboutTranslationsTestUtils, cleanup } = await openAboutTranslations({
    disabled: false,
    autoDownloadFromRemoteSettings: true,
  });

  await aboutTranslationsTestUtils.assertIsVisible({
    pageHeader: true,
    mainUserInterface: true,
    sourceLanguageSelector: true,
    targetLanguageSelector: true,
    swapLanguagesButton: true,
    sourceTextArea: true,
    targetTextArea: true,
    unsupportedInfoMessage: false,
    languageLoadErrorMessage: false,
  });

  await cleanup();
});

/**
 * Checks that the page loads correctly when the global Translations pref is enabled.
 */
add_task(async function test_about_translations_engine_unsupported() {
  const { aboutTranslationsTestUtils, cleanup } = await openAboutTranslations({
    autoDownloadFromRemoteSettings: true,
    prefs: [["browser.translations.simulateUnsupportedEngine", true]],
  });

  await aboutTranslationsTestUtils.assertIsVisible({
    pageHeader: true,
    unsupportedInfoMessage: true,
    mainUserInterface: false,
    sourceLanguageSelector: false,
    targetLanguageSelector: false,
    swapLanguagesButton: false,
    sourceTextArea: false,
    targetTextArea: false,
    languageLoadErrorMessage: false,
  });

  await cleanup();
});
