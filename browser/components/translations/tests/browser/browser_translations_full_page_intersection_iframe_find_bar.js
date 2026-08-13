/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * This test case ensures that opening the FindBar during translation enables content-eager
 * translation across both page-level and iframe-level boundaries, while attribute translation
 * remains lazily intersection-based both for main page content and iframe content.
 */
add_task(
  async function test_findbar_open_switches_iframe_translation_to_content_eager_mode() {
    const { cleanup, resolveDownloads, runInPage, tab } = await loadTestPage({
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

    await FullPageTranslationsTestUtils.mutateIframeH1({
      iframeId: "top-frame",
      runInPage,
      textContent:
        "Este contenido de texto de h1 del iframe para findbar se modificó.",
      title:
        "Este atributo de título de h1 del iframe para findbar se modificó.",
    });

    await FullPageTranslationsTestUtils.waitForAllPendingTranslationsToComplete(
      runInPage
    );

    await FullPageTranslationsTestUtils.assertIframeH1ContentMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "Este contenido de texto de h1 del iframe para findbar se modificó.",
      message:
        "The top iframe H1 content is not translated while out of the iframe viewport.",
    });

    await FullPageTranslationsTestUtils.assertIframeH1TitleMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "Este atributo de título de h1 del iframe para findbar se modificó.",
      message:
        "The top iframe H1 title is not translated while out of the iframe viewport.",
    });

    info(
      "Opening the find bar, which should switch iframe content translations into content eager mode."
    );
    await openFindBar(tab);

    await FullPageTranslationsTestUtils.assertIframeFinalParagraphContentIsTranslated(
      {
        iframeId: "top-frame",
        fromLanguage: "es",
        toLanguage: "en",
        runInPage,
      }
    );

    await FullPageTranslationsTestUtils.assertIframeH1ContentIsTranslated({
      iframeId: "bottom-frame",
      fromLanguage: "es",
      toLanguage: "en",
      runInPage,
    });

    await FullPageTranslationsTestUtils.assertIframeFinalParagraphContentIsTranslated(
      {
        iframeId: "bottom-frame",
        fromLanguage: "es",
        toLanguage: "en",
        runInPage,
      }
    );

    await FullPageTranslationsTestUtils.assertLangTagIsShownOnTranslationsButton(
      "es",
      "en"
    );

    await FullPageTranslationsTestUtils.assertIframeH1ContentMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "ESTE CONTENIDO DE TEXTO DE H1 DEL IFRAME PARA FINDBAR SE MODIFICÓ. [es to en]",
      message:
        "The top iframe H1 content is translated after opening the find bar.",
    });

    await FullPageTranslationsTestUtils.assertIframeH1TitleMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "Este atributo de título de h1 del iframe para findbar se modificó.",
      message:
        "The top iframe H1 title remains untranslated while still out of the iframe viewport.",
    });

    await FullPageTranslationsTestUtils.scrollToTopOfIframe({
      iframeId: "top-frame",
      runInPage,
    });

    await FullPageTranslationsTestUtils.waitForAllPendingTranslationsToComplete(
      runInPage
    );

    await FullPageTranslationsTestUtils.assertIframeH1TitleMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "ESTE ATRIBUTO DE TÍTULO DE H1 DEL IFRAME PARA FINDBAR SE MODIFICÓ. [es to en]",
      message:
        "The top iframe H1 title is translated after re-entering the iframe viewport.",
    });

    await cleanup();
  }
);

/**
 * This test case ensures that closing the FindBar during translation returns translation
 * to lazy mode both for main page content and for iframe content.
 */
add_task(
  async function test_findbar_close_switches_iframe_translation_back_to_lazy_mode() {
    const { cleanup, resolveDownloads, runInPage, tab } = await loadTestPage({
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

    info(
      "Closing the find bar, which should switch iframe translations back into lazy mode."
    );
    await closeFindBar(tab);

    await scrollToBottomOfPage(runInPage);

    await FullPageTranslationsTestUtils.mutateIframeH1({
      iframeId: "top-frame",
      runInPage,
      textContent:
        "Este contenido de texto de h1 del iframe después de cerrar findbar se modificó.",
      title:
        "Este atributo de título de h1 del iframe después de cerrar findbar se modificó.",
    });

    await FullPageTranslationsTestUtils.waitForAllPendingTranslationsToComplete(
      runInPage
    );

    await FullPageTranslationsTestUtils.assertIframeH1ContentMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "Este contenido de texto de h1 del iframe después de cerrar findbar se modificó.",
      message:
        "The top iframe H1 content is not translated while the iframe is outside the page viewport.",
    });

    await FullPageTranslationsTestUtils.assertIframeH1TitleMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "Este atributo de título de h1 del iframe después de cerrar findbar se modificó.",
      message:
        "The top iframe H1 title is not translated while the iframe is outside the page viewport.",
    });

    await scrollToTopOfPage(runInPage);

    await FullPageTranslationsTestUtils.waitForAllPendingTranslationsToComplete(
      runInPage
    );

    await FullPageTranslationsTestUtils.assertIframeH1ContentMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "ESTE CONTENIDO DE TEXTO DE H1 DEL IFRAME DESPUÉS DE CERRAR FINDBAR SE MODIFICÓ. [es to en]",
      message:
        "The top iframe H1 content is translated after the iframe re-enters the page viewport.",
    });

    await FullPageTranslationsTestUtils.assertIframeH1TitleMatches({
      iframeId: "top-frame",
      runInPage,
      expectedResult:
        "ESTE ATRIBUTO DE TÍTULO DE H1 DEL IFRAME DESPUÉS DE CERRAR FINDBAR SE MODIFICÓ. [es to en]",
      message:
        "The top iframe H1 title is translated after the iframe re-enters the page viewport.",
    });

    await cleanup();
  }
);
