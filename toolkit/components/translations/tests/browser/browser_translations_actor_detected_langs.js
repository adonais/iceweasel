/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_lang_tag_resolution() {
  const { cleanup, tab } = await loadTestPage({
    // This page is replaced by an inline per-lang-tag test page.
    page: BLANK_PAGE_URL,
    autoDownloadFromRemoteSettings: true,
    languagePairs: [
      // Spanish
      { fromLang: "es", toLang: "en" },
      { fromLang: "en", toLang: "es" },

      // Norwegian Bokmål
      { fromLang: "nb", toLang: "en" },
      { fromLang: "en", toLang: "nb" },

      // Chinese (Simplified)
      { fromLang: "zh-Hans", toLang: "en" },
      { fromLang: "en", toLang: "zh-Hans" },

      // Chinese (Traditional)
      { fromLang: "zh-Hant", toLang: "en" },
      { fromLang: "en", toLang: "zh-Hant" },
    ],
  });

  async function getLangTagsFor(langTag) {
    const { docLangTag, userLangTag, isDocLangTagSupported } =
      await getLangTagsForLangTagTestPage(tab.linkedBrowser, langTag);
    return { docLangTag, userLangTag, isDocLangTagSupported };
  }

  Assert.deepEqual(
    await getLangTagsFor("es"),
    {
      docLangTag: "es",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "Spanish resolves to a supported language."
  );

  Assert.deepEqual(
    await getLangTagsFor("de"),
    {
      docLangTag: "de",
      userLangTag: "en",
      isDocLangTagSupported: false,
    },
    "German resolves to a valid but unsupported language."
  );

  Assert.deepEqual(
    await getLangTagsFor("nb"),
    {
      docLangTag: "nb",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "Norwegian Bokmål resolves to a supported language."
  );

  Assert.deepEqual(
    await getLangTagsFor("nn"),
    {
      docLangTag: "nn",
      userLangTag: "en",
      isDocLangTagSupported: false,
    },
    "Norwegian Nynorsk resolves to a valid but unsupported language."
  );

  Assert.deepEqual(
    await getLangTagsFor("no"),
    {
      docLangTag: "nb",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "The Norwegian macro language resolves to Norwegian Bokmål."
  );

  Assert.deepEqual(
    await getLangTagsFor("zh-Hans"),
    {
      docLangTag: "zh-Hans",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "'zh-Hans' represents Simplified Chinese, commonly used in Mainland China, Malaysia, and Singapore."
  );

  Assert.deepEqual(
    await getLangTagsFor("zh"),
    {
      docLangTag: "zh-Hans",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "The 'zh' language tag defaults to 'zh-Hans' (Simplified Chinese)."
  );

  Assert.deepEqual(
    await getLangTagsFor("zh-CN"),
    {
      docLangTag: "zh-Hans",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "'zh-CN' maps to 'zh-Hans' (Simplified Chinese), commonly used in Mainland China."
  );

  Assert.deepEqual(
    await getLangTagsFor("zh-MY"),
    {
      docLangTag: "zh-Hans",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "'zh-MY' maps to 'zh-Hans' (Simplified Chinese), commonly used in Malaysia."
  );

  Assert.deepEqual(
    await getLangTagsFor("zh-SG"),
    {
      docLangTag: "zh-Hans",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "'zh-SG' maps to 'zh-Hans' (Simplified Chinese), commonly used in Singapore."
  );

  Assert.deepEqual(
    await getLangTagsFor("zh-Hant"),
    {
      docLangTag: "zh-Hant",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "'zh-Hant' represents Traditional Chinese, commonly used in Hong Kong, Macau, and Taiwan."
  );

  Assert.deepEqual(
    await getLangTagsFor("zh-TW"),
    {
      docLangTag: "zh-Hant",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "'zh-TW' maps to 'zh-Hant' (Traditional Chinese), commonly used in Taiwan."
  );

  Assert.deepEqual(
    await getLangTagsFor("zh-HK"),
    {
      docLangTag: "zh-Hant",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "'zh-HK' maps to 'zh-Hant' (Traditional Chinese), commonly used in Hong Kong."
  );

  Assert.deepEqual(
    await getLangTagsFor("zh-MO"),
    {
      docLangTag: "zh-Hant",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "'zh-MO' maps to 'zh-Hant' (Traditional Chinese), commonly used in Macau."
  );

  Assert.deepEqual(
    await getLangTagsFor("zh-Hant-CN"),
    {
      docLangTag: "zh-Hant",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "An explicit 'Hant' script tag takes precedence, even though 'Hans' is commonly used in Mainland China."
  );

  Assert.deepEqual(
    await getLangTagsFor("zh-Hans-TW"),
    {
      docLangTag: "zh-Hans",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "An explicit 'Hans' script tag takes precedence, even though 'Hant' is commonly used in Taiwan."
  );

  Assert.deepEqual(
    await getLangTagsFor("es-Latn-ES"),
    {
      docLangTag: "es",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    "A maximized lang tag with a script will resolve to the model's lang tag if the script matches the expectation."
  );

  Assert.deepEqual(
    await getLangTagsFor("es-Hans"),
    {
      docLangTag: "es-Hans",
      userLangTag: "en",
      isDocLangTagSupported: false,
    },
    "A valid lang tag with a nonstandard script will be recognized, but is not resolvable to a model due to the script mismatch."
  );

  Assert.deepEqual(
    await getLangTagsFor("spa"),
    {
      docLangTag: "es",
      userLangTag: "en",
      isDocLangTagSupported: true,
    },
    'The three letter "spa" locale is canonicalized to "es".'
  );

  Assert.deepEqual(
    await getLangTagsFor("gibberish"),
    {
      docLangTag: "en",
      userLangTag: null,
      isDocLangTagSupported: true,
    },
    "A gibberish locale is discarded, and the language is identified from the text sample."
  );

  return cleanup();
});
