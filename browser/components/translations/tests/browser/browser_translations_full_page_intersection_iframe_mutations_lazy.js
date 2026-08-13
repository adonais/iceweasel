/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * This test case ensures that node mutations inside of an iframe that is intersecting with the top-level
 * viewport are still translated only lazily with respect to that iframe's own viewport.
 */
add_task(
  async function test_mutated_iframe_nodes_are_translated_lazily_with_respect_to_iframes_viewport() {
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

    await FullPageTranslationsTestUtils.scrollToBottomOfIframe({
      iframeId: "top-frame",
      runInPage,
    });

    info(
      "Mutating the top iframe H1 after scrolling it out of the iframe viewport."
    );
    await FullPageTranslationsTestUtils.mutateIframeH1({
      iframeId: "top-frame",
      runInPage,
      textContent: "Este contenido de texto de h1 del iframe se modificó.",
      title: "Este atributo de título de h1 del iframe se modificó.",
    });

    await FullPageTranslationsTestUtils.waitForAllPendingTranslationsToComplete(
      runInPage
    );

    await FullPageTranslationsTestUtils.assertIframeH1ContentMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult: "Este contenido de texto de h1 del iframe se modificó.",
      message:
        "The top iframe H1 content is not translated while out of the iframe viewport.",
    });

    await FullPageTranslationsTestUtils.assertIframeH1TitleMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult: "Este atributo de título de h1 del iframe se modificó.",
      message:
        "The top iframe H1 title is not translated while out of the iframe viewport.",
    });

    info(
      "Scrolling the top iframe back to the top so the mutated H1 re-enters the iframe viewport."
    );
    await FullPageTranslationsTestUtils.scrollToTopOfIframe({
      iframeId: "top-frame",
      runInPage,
    });

    await FullPageTranslationsTestUtils.waitForAllPendingTranslationsToComplete(
      runInPage
    );

    await FullPageTranslationsTestUtils.assertIframeH1ContentMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "ESTE CONTENIDO DE TEXTO DE H1 DEL IFRAME SE MODIFICÓ. [es to en]",
      message:
        "The top iframe H1 content is translated after re-entering the iframe viewport.",
    });

    await FullPageTranslationsTestUtils.assertIframeH1TitleMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "ESTE ATRIBUTO DE TÍTULO DE H1 DEL IFRAME SE MODIFICÓ. [es to en]",
      message:
        "The top iframe H1 title is translated after re-entering the iframe viewport.",
    });

    await cleanup();
  }
);

/**
 * This test case ensures that mutations inside an iframe remain lazy at the top-level
 * page boundary when the iframe itself is outside the page viewport.
 */
add_task(
  async function test_mutated_iframe_nodes_entering_page_proximity_are_translated_in_lazy_mode() {
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
      "Scrolling the top-level page so the bottom iframe begins translating."
    );
    await scrollToBottomOfPage(runInPage);

    await FullPageTranslationsTestUtils.assertIframeH1ContentIsTranslated({
      iframeId: "bottom-frame",
      fromLanguage: "es",
      toLanguage: "en",
      runInPage,
    });

    info(
      "Mutating the top iframe H1 while that iframe remains outside the page viewport."
    );
    await FullPageTranslationsTestUtils.mutateIframeH1({
      iframeId: "top-frame",
      runInPage,
      textContent:
        "Este contenido de texto de h1 del iframe fuera de página se modificó.",
      title:
        "Este atributo de título de h1 del iframe fuera de página se modificó.",
    });

    await FullPageTranslationsTestUtils.waitForAllPendingTranslationsToComplete(
      runInPage
    );

    await FullPageTranslationsTestUtils.assertIframeH1ContentMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "Este contenido de texto de h1 del iframe fuera de página se modificó.",
      message:
        "The top iframe H1 content is not translated while the iframe is outside the page viewport.",
    });

    await FullPageTranslationsTestUtils.assertIframeH1TitleMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "Este atributo de título de h1 del iframe fuera de página se modificó.",
      message:
        "The top iframe H1 title is not translated while the iframe is outside the page viewport.",
    });

    info(
      "Scrolling back to the top-level page so the top iframe re-enters the page viewport."
    );
    await scrollToTopOfPage(runInPage);

    await FullPageTranslationsTestUtils.waitForAllPendingTranslationsToComplete(
      runInPage
    );

    await FullPageTranslationsTestUtils.assertIframeH1ContentMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "ESTE CONTENIDO DE TEXTO DE H1 DEL IFRAME FUERA DE PÁGINA SE MODIFICÓ. [es to en]",
      message:
        "The top iframe H1 content is translated after the iframe re-enters the page viewport.",
    });

    await FullPageTranslationsTestUtils.assertIframeH1TitleMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "ESTE ATRIBUTO DE TÍTULO DE H1 DEL IFRAME FUERA DE PÁGINA SE MODIFICÓ. [es to en]",
      message:
        "The top iframe H1 title is translated after the iframe re-enters the page viewport.",
    });

    await cleanup();
  }
);
