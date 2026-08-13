/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * This test case ensures that an iframe that intersects with the top-level viewport observer still
 * translates its content only lazily based on the content's intersection with the iframe's own viewport.
 */
add_task(
  async function test_iframe_content_translates_lazily_based_on_iframes_viewport() {
    const { cleanup, resolveDownloads, runInPage } = await loadTestPage({
      page: SPANISH_IFRAME_PAGE_URL,
      languagePairs: LANGUAGE_PAIRS,
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

    await FullPageTranslationsTestUtils.assertOnlyIntersectingIframeNodesAreTranslated(
      {
        intersectingIframeIds: ["top-frame"],
        outOfRangeIframeIds: ["bottom-frame"],
        fromLanguage: "es",
        toLanguage: "en",
        runInPage,
      }
    );

    info(
      "Scrolling within the top iframe so its offscreen final paragraph enters the iframe viewport."
    );
    await FullPageTranslationsTestUtils.scrollToBottomOfIframe({
      iframeId: "top-frame",
      runInPage,
    });

    await FullPageTranslationsTestUtils.assertIframeFinalParagraphContentIsTranslated(
      {
        iframeId: "top-frame",
        fromLanguage: "es",
        toLanguage: "en",
        runInPage,
      }
    );

    await cleanup();
  }
);

/**
 * This test case ensures that an iframe that does not intersect with the top-level viewport observer will not
 * begin to translate its content until the iframe itself is within observation range of the top-level viewport.
 */
add_task(
  async function test_preexisting_iframes_are_translated_lazily_with_respect_to_the_page_viewport() {
    const { cleanup, resolveDownloads, runInPage } = await loadTestPage({
      page: SPANISH_IFRAME_PAGE_URL,
      languagePairs: LANGUAGE_PAIRS,
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

    await FullPageTranslationsTestUtils.assertOnlyIntersectingIframeNodesAreTranslated(
      {
        intersectingIframeIds: ["top-frame"],
        outOfRangeIframeIds: ["bottom-frame"],
        fromLanguage: "es",
        toLanguage: "en",
        runInPage,
      }
    );

    info(
      "Scrolling the top-level page so the bottom iframe enters the page viewport."
    );
    await scrollToBottomOfPage(runInPage);

    await FullPageTranslationsTestUtils.assertIframeH1ContentIsTranslated({
      iframeId: "bottom-frame",
      fromLanguage: "es",
      toLanguage: "en",
      runInPage,
    });

    await FullPageTranslationsTestUtils.assertIframeFinalParagraphContentIsNotTranslated(
      {
        iframeId: "bottom-frame",
        runInPage,
      }
    );

    await cleanup();
  }
);

/**
 * This test case ensures that iframes inserted after translation has already started
 * still obey the top-level viewport's lazy intersection: a newly inserted iframe within
 * the page viewport begins translating immediately, while an offscreen inserted iframe waits
 * until the page scrolls within its observable proximity.
 */
add_task(
  async function test_inserted_iframes_are_translated_lazily_with_respect_to_the_page_viewport() {
    const { cleanup, resolveDownloads, runInPage } = await loadTestPage({
      page: SPANISH_IFRAME_PAGE_URL,
      languagePairs: LANGUAGE_PAIRS,
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

    await FullPageTranslationsTestUtils.assertOnlyIntersectingIframeNodesAreTranslated(
      {
        intersectingIframeIds: ["top-frame"],
        outOfRangeIframeIds: ["bottom-frame"],
        fromLanguage: "es",
        toLanguage: "en",
        runInPage,
      }
    );

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

    await FullPageTranslationsTestUtils.assertIframeH1ContentIsTranslated({
      iframeId: "injected-top-frame",
      fromLanguage: "es",
      toLanguage: "en",
      runInPage,
    });

    await FullPageTranslationsTestUtils.assertIframeH1ContentIsNotTranslated({
      iframeId: "injected-bottom-frame",
      runInPage,
    });

    info(
      "Scrolling the top-level page so the injected bottom iframe enters the page viewport."
    );
    await scrollToBottomOfPage(runInPage);

    await FullPageTranslationsTestUtils.assertIframeH1ContentIsTranslated({
      iframeId: "injected-bottom-frame",
      fromLanguage: "es",
      toLanguage: "en",
      runInPage,
    });

    await cleanup();
  }
);
