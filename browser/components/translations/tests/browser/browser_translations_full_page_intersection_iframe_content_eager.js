/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * This test case ensures that iframe content is translated fully in content-eager mode,
 * even when the iframe is outside the top-level viewport intersection observer range or
 * the translated node is outside of the iframe viewport intersection observer range.
 */
add_task(
  async function test_all_iframe_content_is_translated_in_content_eager_mode() {
    const { cleanup, resolveDownloads, runInPage } = await loadTestPage({
      page: SPANISH_IFRAME_PAGE_URL,
      languagePairs: LANGUAGE_PAIRS,
      contentEagerMode: true,
    });

    await FullPageTranslationsTestUtils.assertTranslationsButton(
      { button: true },
      "The translations button is visible."
    );

    await FullPageTranslationsTestUtils.openPanel({
      expectedFromLanguage: "es",
      expectedToLanguage: "en",
      onOpenPanel: FullPageTranslationsTestUtils.assertPanelViewIntro,
    });

    await FullPageTranslationsTestUtils.clickTranslateButton({
      downloadHandler: resolveDownloads,
    });

    await FullPageTranslationsTestUtils.assertAllIframeContentIsTranslated({
      fromLanguage: "es",
      toLanguage: "en",
      runInPage,
    });

    await cleanup();
  }
);

/**
 * This test case ensures that iframes inserted after translation has already started
 * are translated immediately in content-eager mode, even if the inserted frame is
 * beyond the top-level viewport intersection observer.
 */
add_task(
  async function test_all_inserted_iframes_are_translated_in_content_eager_mode() {
    const { cleanup, resolveDownloads, runInPage } = await loadTestPage({
      page: SPANISH_IFRAME_PAGE_URL,
      languagePairs: LANGUAGE_PAIRS,
      contentEagerMode: true,
    });

    await FullPageTranslationsTestUtils.assertTranslationsButton(
      { button: true },
      "The translations button is visible."
    );

    await FullPageTranslationsTestUtils.openPanel({
      expectedFromLanguage: "es",
      expectedToLanguage: "en",
      onOpenPanel: FullPageTranslationsTestUtils.assertPanelViewIntro,
    });

    await FullPageTranslationsTestUtils.clickTranslateButton({
      downloadHandler: resolveDownloads,
    });

    await FullPageTranslationsTestUtils.assertAllIframeContentIsTranslated({
      fromLanguage: "es",
      toLanguage: "en",
      runInPage,
    });

    await FullPageTranslationsTestUtils.insertIframe({
      iframeId: "injected-top-frame",
      runInPage,
      referenceIframeId: "top-frame",
      position: "beforebegin",
    });

    await FullPageTranslationsTestUtils.insertIframe({
      iframeId: "injected-bottom-frame",
      runInPage,
      referenceIframeId: "bottom-frame",
      position: "afterend",
    });

    await FullPageTranslationsTestUtils.assertIframeContentIsTranslated({
      iframeId: "injected-top-frame",
      fromLanguage: "es",
      toLanguage: "en",
      runInPage,
    });

    await FullPageTranslationsTestUtils.assertIframeContentIsTranslated({
      iframeId: "injected-bottom-frame",
      fromLanguage: "es",
      toLanguage: "en",
      runInPage,
    });

    await cleanup();
  }
);
