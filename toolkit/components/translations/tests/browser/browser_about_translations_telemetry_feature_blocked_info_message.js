/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests that about:translations records telemetry when the feature-blocked-info
 * message is shown.
 */
add_task(
  async function test_about_translations_telemetry_feature_blocked_info_message() {
    const { aboutTranslationsTestUtils, cleanup } = await openAboutTranslations(
      {
        featureEnabled: false,
        autoDownloadFromRemoteSettings: true,
      }
    );

    await aboutTranslationsTestUtils.assertIsVisible({
      pageHeader: true,
      mainUserInterface: true,
      sourceLanguageSelector: true,
      targetLanguageSelector: true,
      copyButton: true,
      swapLanguagesButton: true,
      sourceSectionTextArea: true,
      targetSectionTextArea: true,
      unsupportedInfoMessage: false,
      policyDisabledInfoMessage: false,
      featureBlockedInfoMessage: true,
      languageLoadErrorMessage: false,
    });

    await TestTranslationsTelemetry.assertEvent(
      Glean.translationsAboutTranslationsPage.open,
      {
        expectedEventCount: 1,
        expectNewFlowId: true,
      }
    );
    await TestTranslationsTelemetry.assertEvent(
      Glean.translationsAboutTranslationsPage.featureBlockedInfoMessage,
      {
        expectedEventCount: 1,
        expectNewFlowId: false,
      }
    );
    await TestTranslationsTelemetry.assertEvent(
      Glean.translationsAboutTranslationsPage.languageLoadErrorMessage,
      {
        expectedEventCount: 0,
      }
    );
    await TestTranslationsTelemetry.assertEvent(
      Glean.translationsAboutTranslationsPage.unsupportedInfoMessage,
      {
        expectedEventCount: 0,
      }
    );
    await TestTranslationsTelemetry.assertEvent(
      Glean.translationsAboutTranslationsPage.policyDisabledInfoMessage,
      {
        expectedEventCount: 0,
      }
    );

    await cleanup();
  }
);
