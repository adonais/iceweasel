/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function runLangTagsTest(
  {
    systemLocales,
    appLocales,
    webLanguages,
    // When set, overrides AppConstants.platform (e.g. "android"). On Android the
    // offer decision only considers the primary web-content language.
    platform = null,
    page,
    languagePairs = LANGUAGE_PAIRS,
  },
  langTags
) {
  const cleanupLocales = await mockLocales({
    systemLocales,
    appLocales,
    webLanguages,
  });

  TranslationsParent.mockedPlatform = platform;

  const { cleanup: cleanupTestPage } = await loadTestPage({
    page,
    languagePairs,
  });
  const actor = getTranslationsParent();

  await waitForCondition(
    async () => actor.languageState.detectedLanguages?.docLangTag,
    "Waiting for a document language tag to be found."
  );

  const { docLangTag, userLangTag, isDocLangTagSupported } =
    actor.languageState.detectedLanguages;

  Assert.deepEqual(
    { docLangTag, userLangTag, isDocLangTagSupported },
    langTags
  );

  TranslationsParent.mockedPlatform = null;
  await cleanupLocales();
  await cleanupTestPage();
}

add_task(async function test_lang_tags_direct_translations() {
  info(
    "Test the detected languages for translations when a language pair is available"
  );
  await runLangTagsTest(
    {
      systemLocales: ["en"],
      appLocales: ["en"],
      webLanguages: ["en"],
      page: SPANISH_PAGE_URL,
    },
    {
      docLangTag: "es",
      userLangTag: "en",
      isDocLangTagSupported: true,
    }
  );
});

add_task(async function test_lang_tags_with_pivots() {
  info("Test the detected languages for translations when a pivot is needed.");
  await runLangTagsTest(
    {
      systemLocales: ["fr"],
      appLocales: ["fr", "en"],
      webLanguages: ["fr", "en"],
      page: SPANISH_PAGE_URL,
    },
    {
      docLangTag: "es",
      userLangTag: "fr",
      isDocLangTagSupported: true,
    }
  );
});

add_task(async function test_lang_tags_with_pivots_second_preferred() {
  info(
    "Test using a pivot language when the first preferred lang tag doesn't match"
  );
  await runLangTagsTest(
    {
      systemLocales: ["it"],
      appLocales: ["it", "en"],
      webLanguages: ["it", "en"],
      page: SPANISH_PAGE_URL,
    },
    {
      docLangTag: "es",
      userLangTag: "en",
      isDocLangTagSupported: true,
    }
  );
});

add_task(async function test_lang_tags_android_offers_secondary_language() {
  info(
    "On Android the Accept-Language list is generated from the app and OS " +
      "locales rather than user-curated, so only the primary language ('fr') " +
      "suppresses the offer. A page in a secondary language ('en') is still " +
      "offered a translation into the primary language."
  );
  await runLangTagsTest(
    {
      systemLocales: ["fr"],
      appLocales: ["fr", "en"],
      // French is primary; English is a secondary entry.
      webLanguages: ["fr", "en"],
      platform: "android",
      page: ENGLISH_PAGE_URL,
    },
    {
      docLangTag: "en",
      userLangTag: "fr",
      isDocLangTagSupported: true,
    }
  );
});

add_task(
  async function test_lang_tags_non_android_suppresses_secondary_language() {
    info(
      "Off Android, every configured web-content language is considered, so a " +
        "page in a secondary language the user has listed ('en') is not offered a " +
        "translation. Same inputs as the Android case above, to show the behavior " +
        "is scoped to Android."
    );
    await runLangTagsTest(
      {
        systemLocales: ["fr"],
        appLocales: ["fr", "en"],
        webLanguages: ["fr", "en"],
        platform: "linux",
        page: ENGLISH_PAGE_URL,
      },
      {
        docLangTag: "en",
        userLangTag: null,
        isDocLangTagSupported: true,
      }
    );
  }
);

add_task(async function test_lang_tags_with_non_supported_doc_language() {
  info("Test using a pivot language when the doc language isn't supported");
  await runLangTagsTest(
    {
      systemLocales: ["fr"],
      appLocales: ["fr", "en"],
      webLanguages: ["fr", "en"],
      page: SPANISH_PAGE_URL,
      languagePairs: [
        { fromLang: PIVOT_LANGUAGE, toLang: "fr" },
        { fromLang: "fr", toLang: PIVOT_LANGUAGE },
        // No Spanish support.
      ],
    },
    {
      docLangTag: "es",
      userLangTag: "fr",
      isDocLangTagSupported: false,
    }
  );
});
