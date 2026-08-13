/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_full_page_translation_in_iframe() {
  const { cleanup, runInPage } = await loadTestPage({
    page: SPANISH_IFRAME_PAGE_URL,
    autoDownloadFromRemoteSettings: true,
    languagePairs: [
      { fromLang: "es", toLang: "en" },
      { fromLang: "en", toLang: "es" },
    ],
  });

  try {
    await getTranslationsParent().translate(
      {
        sourceLanguage: "es",
        targetLanguage: "en",
      },
      false
    );

    await assertTranslationResultInBrowsingContext({
      browsingContext: await getIframeBrowsingContext(runInPage, "top-frame"),
      selector: "h1",
      expectedResult: "DON QUIJOTE DE LA MANCHA [es to en]",
      message: "The iframe heading is translated.",
    });
  } finally {
    await cleanup();
  }
});

add_task(async function test_full_page_translation_in_cross_origin_iframe() {
  const { cleanup, runInPage } = await loadTestPage({
    page: SPANISH_IFRAME_PAGE_URL,
    autoDownloadFromRemoteSettings: true,
    contentEagerMode: true,
    languagePairs: [
      { fromLang: "es", toLang: "en" },
      { fromLang: "en", toLang: "es" },
    ],
  });

  try {
    const preexistingBrowsingContext = await navigateIframeToUrl(runInPage, {
      iframeId: "top-frame",
      url: `${SPANISH_PAGE_URL_DOT_ORG}?frame=preexisting-cross-origin`,
    });

    Assert.equal(
      await getContentOrigin(preexistingBrowsingContext),
      "https://example.org",
      "The existing iframe is loaded from example.org"
    );

    await getTranslationsParent().translate(
      {
        sourceLanguage: "es",
        targetLanguage: "en",
      },
      false
    );

    await assertTranslationResultInBrowsingContext({
      browsingContext: preexistingBrowsingContext,
      selector: "h1",
      expectedResult: "DON QUIJOTE DE LA MANCHA [es to en]",
      message: "The existing cross-origin iframe heading is translated.",
    });

    const dynamicBrowsingContext = await insertIframeIntoPage(runInPage, {
      iframeId: "dynamic-cross-origin-frame",
      referenceIframeId: "bottom-frame",
      position: "afterend",
      src: `${SPANISH_PAGE_URL_DOT_ORG}?frame=dynamic-cross-origin`,
    });

    Assert.equal(
      await getContentOrigin(dynamicBrowsingContext),
      "https://example.org",
      "The dynamically inserted iframe is loaded from example.org"
    );

    await assertTranslationResultInBrowsingContext({
      browsingContext: dynamicBrowsingContext,
      selector: "h1",
      expectedResult: "DON QUIJOTE DE LA MANCHA [es to en]",
      message: "The dynamic cross-origin iframe heading is translated.",
    });
  } finally {
    await cleanup();
  }
});
