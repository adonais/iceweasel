/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * The decision table for Translations offer behavior after resolving the HTML lang
 * attribute and the identified page language.
 *
 * The table below expands the resulting outcomes.
 * Keep this in sync with TranslationsParent's offer-outcome logic.
 *
 * Status values:
 * - SUPPORTED:
 *     The candidate maps to a source language that Translations can use.
 *
 * - UNSUPPORTED:
 *     The candidate does not map to a supported source language.
 *
 * - USER:
 *     The candidate matches a user's web-content language. This may help us determine
 *     which language tag we want to use if there is a discrepancy between the HTML
 *     language tag and the language tag that was identified from the page's sample text.
 *
 * - NONE:
 *     There is no usable HTML language candidate.
 *
 * Actions:
 * - ALLOW:
 *     Either show the Translations panel, or auto-translate if the user's settings say to.
 *
 * - BUTTON:
 *     Show only the translations button in the URL bar.
 *     This is used when we have a signal that the page may be translatable, but not enough
 *     confidence in the chosen source language to justify taking an automatic action.
 *
 * - HIDE:
 *     Hide the translations button.
 *
 * Source values:
 *
 * - HTML:
 *     Use the HTML lang tag as the source language.
 *
 * - IDENTIFIED:
 *     Use the language identified from the sample text as the source language.
 *
 * - -:
 *     All values produce the same outcome.
 *
 * ID Agrees values:
 * - TRUE:
 *     The HTML and identified candidates match after language-tag normalization.
 *
 * - FALSE:
 *     The HTML and identified candidates do not match after language-tag normalization.
 *
 * - -:
 *     All values produce the same outcome.
 *
 * Confidence values:
 * - HIGH:
 *     The extracted text sample was long enough to trust the language identification.
 *
 * - LOW:
 *     The extracted text sample was too short to fully trust the language identification.
 *
 * - -:
 *     All values produce the same outcome.
 *
 * ┌─────┬─────────────┬─────────────┬───────────┬────────────┬────────┬────────────┐
 * │ #   │ HTML Status │ ID Status   │ ID Agrees │ Confidence │ Action │ Source     │
 * ├─────┼─────────────┼─────────────┼───────────┼────────────┼────────┼────────────┤
 * │ 01  │ SUPPORTED   │ SUPPORTED   │ TRUE      │ -          │ ALLOW  │ HTML       │
 * │ 02  │ USER        │ USER        │ TRUE      │ -          │ HIDE   │ -          │
 * │ 03  │ UNSUPPORTED │ UNSUPPORTED │ TRUE      │ -          │ HIDE   │ -          │
 * │ 04  │ SUPPORTED   │ SUPPORTED   │ FALSE     │ HIGH       │ ALLOW  │ IDENTIFIED │
 * │ 05  │ USER        │ SUPPORTED   │ FALSE     │ HIGH       │ ALLOW  │ IDENTIFIED │
 * │ 06  │ USER        │ UNSUPPORTED │ FALSE     │ HIGH       │ HIDE   │ IDENTIFIED │
 * │ 07  │ SUPPORTED   │ USER        │ FALSE     │ HIGH       │ ALLOW  │ HTML       │
 * │ 08  │ UNSUPPORTED │ USER        │ FALSE     │ HIGH       │ HIDE   │ IDENTIFIED │
 * │ 09  │ USER        │ USER        │ FALSE     │ HIGH       │ HIDE   │ IDENTIFIED │
 * │ 10  │ SUPPORTED   │ UNSUPPORTED │ FALSE     │ HIGH       │ BUTTON │ HTML       │
 * │ 11  │ UNSUPPORTED │ SUPPORTED   │ FALSE     │ HIGH       │ ALLOW  │ IDENTIFIED │
 * │ 12  │ UNSUPPORTED │ UNSUPPORTED │ FALSE     │ HIGH       │ HIDE   │ IDENTIFIED │
 * │ 13  │ SUPPORTED   │ -           │ FALSE     │ LOW        │ ALLOW  │ HTML       │
 * │ 14  │ USER        │ SUPPORTED   │ FALSE     │ LOW        │ BUTTON │ IDENTIFIED │
 * │ 15  │ USER        │ UNSUPPORTED │ FALSE     │ LOW        │ HIDE   │ HTML       │
 * │ 16  │ USER        │ USER        │ FALSE     │ LOW        │ HIDE   │ HTML       │
 * │ 17  │ UNSUPPORTED │ SUPPORTED   │ FALSE     │ LOW        │ BUTTON │ IDENTIFIED │
 * │ 18  │ UNSUPPORTED │ UNSUPPORTED │ FALSE     │ LOW        │ HIDE   │ HTML       │
 * │ 19  │ UNSUPPORTED │ USER        │ FALSE     │ LOW        │ HIDE   │ HTML       │
 * │ 20  │ NONE        │ SUPPORTED   │ -         │ HIGH       │ ALLOW  │ IDENTIFIED │
 * │ 21  │ NONE        │ USER        │ -         │ HIGH       │ HIDE   │ IDENTIFIED │
 * │ 22  │ NONE        │ UNSUPPORTED │ -         │ HIGH       │ HIDE   │ IDENTIFIED │
 * │ 23  │ NONE        │ SUPPORTED   │ -         │ LOW        │ BUTTON │ IDENTIFIED │
 * │ 24  │ NONE        │ USER        │ -         │ LOW        │ HIDE   │ IDENTIFIED │
 * │ 25  │ NONE        │ UNSUPPORTED │ -         │ LOW        │ HIDE   │ IDENTIFIED │
 * └─────┴─────────────┴─────────────┴───────────┴────────────┴────────┴────────────┘
 */

/**
 * Request 5x longer timeout for this test.
 * There are a lot of test cases in this file, but it doesn't make sense to split them up,
 * since this file serves as comprehensive, testable documentation of the expected behavior.
 */
requestLongerTimeout(5);

/**
 * Definitions for the test cases.
 *
 * @typedef {object} Case
 * @property {string} [testPage] - The page to load.
 * @property {string} [testHtml] - The HTML document to load.
 * @property {string} message - A message for the primary assertion.
 * @property {Array<{fromLang: string, toLang: string}>} [languagePairs] - The supported language pairs.
 * @property {string[]} [webLanguages] - The user's web content languages.
 * @property {string} [alwaysTranslateLanguages] - Set the pref: browser.translations.alwaysTranslateLanguages
 * @property {string} [neverTranslateLanguages] - Set the pref: browser.translations.neverTranslateLanguages
 * @property {string} [manualPanelSourceLanguage] - The expected docLangTag after opening the panel manually.
 * @property {boolean} [skipPageContentAssertion] - Skip content assertions for synthetic pages.
 *
 * Outcomes, use only one:
 * @property {string} [translatePage] - The page is expected to be translated.
 * @property {string} [offerTranslation] - The page offers a translation in this language.
 * @property {boolean} [buttonShown] - The button was shown to offer a translation.
 * @property {boolean} [buttonHidden] - The button was not shown.
 */

const LANGUAGE_PAIRS_WITHOUT_SPANISH_OR_FRENCH = LANGUAGE_PAIRS.filter(
  ({ fromLang, toLang }) =>
    !["es", "fr"].includes(fromLang) && !["es", "fr"].includes(toLang)
);

const LANGUAGE_PAIRS_WITHOUT_FRENCH = LANGUAGE_PAIRS.filter(
  ({ fromLang, toLang }) => fromLang !== "fr" && toLang !== "fr"
);

const html = String.raw;

function spanishContentWithLangHtml(langTag) {
  return html`
    <!DOCTYPE html>
    <html lang=${langTag}>
      <head>
        <meta charset="utf-8" />
        <title>Translations Test</title>
        <style>
          div {
            margin: 10px auto;
            width: 300px;
          }
          p {
            margin: 47px 0;
            font-size: 21px;
            line-height: 2;
          }
        </style>
      </head>
      <body>
        <div>
          <header lang="en">
            The following is an excerpt from Don Quijote de la Mancha, which is
            in the public domain
          </header>
          <h1 title="Este es el título del encabezado de página">
            Don Quijote de La Mancha
          </h1>
          <h2>Capítulo VIII.</h2>
          <p>
            Del buen suceso que el valeroso don Quijote tuvo en la espantable y
            jamás imaginada aventura de los molinos de viento, con otros sucesos
            dignos de felice recordación
          </p>
          <p>
            En esto, descubrieron treinta o cuarenta molinos de viento que hay
            en aquel campo; y, así como don Quijote los vio, dijo a su escudero:
          </p>
          <p>
            — La ventura va guiando nuestras cosas mejor de lo que acertáramos a
            desear, porque ves allí, amigo Sancho Panza, donde se descubren
            treinta, o pocos más, desaforados gigantes, con quien pienso hacer
            batalla y quitarles a todos las vidas, con cuyos despojos
            comenzaremos a enriquecer; que ésta es buena guerra, y es gran
            servicio de Dios quitar tan mala simiente de sobre la faz de la
            tierra.
          </p>
          <p>— ¿Qué gigantes? —dijo Sancho Panza.</p>
          <p>
            — Aquellos que allí ves —respondió su amo— de los brazos largos, que
            los suelen tener algunos de casi dos leguas.
          </p>
          <p>
            — Mire vuestra merced —respondió Sancho— que aquellos que allí se
            parecen no son gigantes, sino molinos de viento, y lo que en ellos
            parecen brazos son las aspas, que, volteadas del viento, hacen andar
            la piedra del molino.
          </p>
          <p>
            — Bien parece —respondió don Quijote— que no estás cursado en esto
            de las aventuras: ellos son gigantes; y si tienes miedo, quítate de
            ahí, y ponte en oración en el espacio que yo voy a entrar con ellos
            en fiera y desigual batalla.
          </p>
          <p>
            Y, diciendo esto, dio de espuelas a su caballo Rocinante, sin
            atender a las voces que su escudero Sancho le daba, advirtiéndole
            que, sin duda alguna, eran molinos de viento, y no gigantes,
            aquellos que iba a acometer. Pero él iba tan puesto en que eran
            gigantes, que ni oía las voces de su escudero Sancho ni echaba de
            ver, aunque estaba ya bien cerca, lo que eran; antes, iba diciendo
            en voces altas:
          </p>
          <p>
            — Non fuyades, cobardes y viles criaturas, que un solo caballero es
            el que os acomete.
          </p>
          <p>
            Levantóse en esto un poco de viento y las grandes aspas comenzaron a
            moverse, lo cual visto por don Quijote, dijo:
          </p>
          <p title="Este es el título del último párrafo">
            — Pues, aunque mováis más brazos que los del gigante Briareo, me lo
            habéis de pagar.
          </p>
        </div>
      </body>
    </html>
  `;
}

function shortSpanishContentWithLangHtml(langTag) {
  return html`
    <!DOCTYPE html>
    <html lang=${langTag}>
      <head>
        <meta charset="utf-8" />
        <title>Translations Test</title>
        <style>
          div {
            margin: 10px auto;
            width: 300px;
          }
          p {
            margin: 47px 0;
            font-size: 21px;
            line-height: 2;
          }
        </style>
      </head>
      <body>
        <div>
          <h1 title="Este es el título del encabezado de página">
            Don Quijote de La Mancha
          </h1>
          <p title="Este es el título del último párrafo">
            — Pues, aunque mováis más brazos que los del gigante Briareo, me lo
            habéis de pagar.
          </p>
        </div>
      </body>
    </html>
  `;
}

function englishContentWithLangHtml(langTag) {
  const englishParagraphs = html`
    <p>
      The little girl, seeing she had lost one of her pretty shoes, grew angry,
      and said to the Witch, "Give me back my shoe!"
    </p>
    <p>
      "I will not," retorted the Witch, "for it is now my shoe, and not yours."
    </p>
    <p>
      "You are a wicked creature!" cried Dorothy. "You have no right to take my
      shoe from me."
    </p>
  `;

  return html`
    <!DOCTYPE html>
    <html lang=${langTag}>
      <head>
        <meta charset="utf-8" />
        <title>Translations Test</title>
      </head>
      <body>
        <h1>The Wonderful Wizard of Oz</h1>
        ${englishParagraphs.repeat(8)}
      </body>
    </html>
  `;
}

/**
 * @type {Case[]}
 */
const cases = [
  // HTML tag and (confident) identification agree.
  {
    // Table row 01 - Auto-translate path.
    testPage: SPANISH_PAGE_URL,
    alwaysTranslateLanguages: "es",
    translatePage: "es",
    message:
      "Auto-translate since the HTML language and identified language agree",
  },
  {
    // Table row 01 - Offer path.
    testPage: SPANISH_PAGE_URL,
    offerTranslation: "es",
    message:
      "The HTML language and identified language agree, offer a translation",
  },
  // HTML tag and (low-confidence) identification agree.
  {
    // Table row 01 - Auto-translate path, with low-confidence identification.
    testPage: SPANISH_PAGE_SHORT_URL,
    alwaysTranslateLanguages: "es",
    translatePage: "es",
    message:
      "The HTML language and identified language agree, offer a translation even " +
      "though the page has a short amount of content.",
  },
  {
    // Table row 01 - Offer path, with low-confidence identification.
    testPage: SPANISH_PAGE_SHORT_URL,
    offerTranslation: "es",
    message:
      "The HTML language and identified language agree, offer a translation",
  },
  {
    // Table row 01 - Offer path, with canonicalized HTML language and low-confidence identification.
    testHtml: shortSpanishContentWithLangHtml("spa"),
    offerTranslation: "es",
    message:
      "The HTML language is canonicalized to a supported language, and the low-confidence identified language agrees. Offer a translation.",
  },
  {
    // Table row 02.
    testPage: SPANISH_PAGE_URL,
    webLanguages: ["es"],
    buttonHidden: true,
    manualPanelSourceLanguage: "es",
    message:
      "The HTML and identified language agree, but they match a user language. Hide the button.",
  },
  {
    // Table row 03.
    testPage: SPANISH_PAGE_URL,
    languagePairs: LANGUAGE_PAIRS_WITHOUT_SPANISH,
    buttonHidden: true,
    manualPanelSourceLanguage: "es",
    message:
      "The HTML and identified language agree, but the language is unsupported. Hide the button.",
  },
  // HTML tag and (confident) identification disagree.
  {
    // Table row 04 - Auto-translate path.
    testPage: SPANISH_PAGE_MISMATCH_URL,
    alwaysTranslateLanguages: "es",
    translatePage: "es",
    message:
      "The HTML and (confident) identified language disagree. Trust the identified language and auto-translate.",
  },
  {
    // Table row 04 - Offer path.
    testPage: SPANISH_PAGE_MISMATCH_URL,
    offerTranslation: "es",
    message:
      "The HTML and (confident) identified language disagree. Trust the identified language and offer.",
  },
  {
    // Table row 05.
    testHtml: spanishContentWithLangHtml("en"),
    offerTranslation: "es",
    message:
      "The HTML language matches the user language, but the confident identified language disagrees. Trust the identified language and offer.",
  },
  {
    // Table row 06.
    testHtml: spanishContentWithLangHtml("en"),
    languagePairs: LANGUAGE_PAIRS_WITHOUT_SPANISH,
    buttonHidden: true,
    manualPanelSourceLanguage: "es",
    message:
      "The HTML language matches the user language, and the confident identified language is unsupported. Hide the button.",
  },
  {
    // Table row 07.
    testHtml: englishContentWithLangHtml("es"),
    offerTranslation: "es",
    skipPageContentAssertion: true,
    message:
      "The confident identified language matches a user-preferred language, so trust the supported HTML language and offer.",
  },
  {
    // Table row 08.
    testHtml: englishContentWithLangHtml("de"),
    buttonHidden: true,
    manualPanelSourceLanguage: "en",
    skipPageContentAssertion: true,
    message:
      "The confident identified language matches a user-preferred language, and the HTML language is unsupported. Hide the button.",
  },
  {
    // Table row 09.
    testPage: SPANISH_PAGE_MISMATCH_URL,
    webLanguages: ["fr", "es"],
    buttonHidden: true,
    manualPanelSourceLanguage: "es",
    message:
      "The HTML and confident identified languages are both user-preferred languages but disagree. Hide the button.",
  },
  {
    // Table row 10.
    testPage: SPANISH_PAGE_MISMATCH_URL,
    languagePairs: LANGUAGE_PAIRS_WITHOUT_SPANISH,
    buttonShown: true,
    manualPanelSourceLanguage: "fr",
    message:
      "The HTML and (confident) identified language disagree, and only the HTML language is supported. Only show the button.",
  },
  {
    // Table row 11.
    testPage: SPANISH_PAGE_MISMATCH_URL,
    languagePairs: LANGUAGE_PAIRS_WITHOUT_FRENCH,
    offerTranslation: "es",
    message:
      "The HTML and (confident) identified language disagree, and only the identified language is supported. Trust the identified language and offer.",
  },
  {
    // Table row 12.
    testPage: SPANISH_PAGE_MISMATCH_URL,
    languagePairs: LANGUAGE_PAIRS_WITHOUT_SPANISH_OR_FRENCH,
    buttonHidden: true,
    manualPanelSourceLanguage: "es",
    message:
      "The HTML and (confident) identified language disagree, and neither language is supported. Hide the button.",
  },
  // HTML tag and (low-confidence) identification disagree.
  {
    // Table row 13 - Auto-translate path.
    testPage: SPANISH_PAGE_MISMATCH_SHORT_URL,
    alwaysTranslateLanguages: "fr",
    translatePage: "fr",
    message:
      "The HTML and (low-confidence) identified language disagree. Trust the HTML language and auto-translate.",
  },
  {
    // Table row 13 - Always-translate setting is for the identified language, not the HTML language.
    testPage: SPANISH_PAGE_MISMATCH_SHORT_URL,
    alwaysTranslateLanguages: "es",
    offerTranslation: "fr",
    message:
      "The HTML and (low-confidence) identified language disagree. Trust the HTML language and offer.",
  },
  {
    // Table row 13 - Offer path.
    testPage: SPANISH_PAGE_MISMATCH_SHORT_URL,
    offerTranslation: "fr",
    message:
      "The HTML and (low-confidence) identified language disagree. Trust the HTML language and offer.",
  },
  {
    // Table row 14.
    testHtml: shortSpanishContentWithLangHtml("en"),
    buttonShown: true,
    manualPanelSourceLanguage: "es",
    message:
      "The HTML language matches the user language, but the supported identified language disagrees with low confidence. Only show the button.",
  },
  {
    // Table row 15.
    testHtml: shortSpanishContentWithLangHtml("en"),
    languagePairs: LANGUAGE_PAIRS_WITHOUT_SPANISH,
    buttonHidden: true,
    manualPanelSourceLanguage: "en",
    message:
      "The HTML language matches the user language, and the low-confidence identified language is unsupported. Hide the button.",
  },
  {
    // Table row 16.
    testPage: SPANISH_PAGE_MISMATCH_SHORT_URL,
    webLanguages: ["fr", "es"],
    buttonHidden: true,
    manualPanelSourceLanguage: "fr",
    message:
      "The HTML and low-confidence identified languages are both user-preferred languages but disagree. Hide the button.",
  },
  {
    // Table row 17.
    testPage: SPANISH_PAGE_MISMATCH_SHORT_URL,
    languagePairs: LANGUAGE_PAIRS_WITHOUT_FRENCH,
    alwaysTranslateLanguages: "es",
    buttonShown: true,
    manualPanelSourceLanguage: "es",
    message:
      "The HTML language is unsupported, and the supported identified language is low-confidence. Only show the button.",
  },
  {
    // Table row 18.
    testPage: SPANISH_PAGE_MISMATCH_SHORT_URL,
    languagePairs: LANGUAGE_PAIRS_WITHOUT_SPANISH_OR_FRENCH,
    buttonHidden: true,
    manualPanelSourceLanguage: "fr",
    message:
      "The HTML language is unsupported, and the low-confidence identified language is unsupported. Hide the button.",
  },
  {
    // Table row 19.
    testHtml: shortSpanishContentWithLangHtml("de"),
    webLanguages: ["es"],
    buttonHidden: true,
    manualPanelSourceLanguage: "de",
    message:
      "The HTML language is unsupported, and the low-confidence identified language matches a user language. Hide the button.",
  },
  // No HTML language tag and (high-confidence) identification.
  {
    // Table row 20 - Auto-translate path.
    testPage: SPANISH_PAGE_UNDECLARED_URL,
    alwaysTranslateLanguages: "es,fr",
    translatePage: "es",
    message:
      "There is no HTML language tag, but there is high confidence in the identified language, so go ahead and auto-translate.",
  },
  {
    // Table row 20 - Offer path.
    testPage: SPANISH_PAGE_UNDECLARED_URL,
    offerTranslation: "es",
    message:
      "There is no HTML language tag, but there is high confidence in the identified language, so go ahead and offer.",
  },
  {
    // Table row 21.
    testPage: SPANISH_PAGE_UNDECLARED_URL,
    webLanguages: ["es"],
    buttonHidden: true,
    manualPanelSourceLanguage: "es",
    message:
      "There is no HTML language tag, and the confident identified language matches a user language. Hide the button.",
  },
  {
    // Table row 22.
    testPage: SPANISH_PAGE_UNDECLARED_URL,
    languagePairs: LANGUAGE_PAIRS_WITHOUT_SPANISH,
    buttonHidden: true,
    manualPanelSourceLanguage: "es",
    message:
      "There is no HTML language tag, and the confident identified language is unsupported. Hide the button.",
  },
  // No HTML language tag and (low-confidence) identification.
  {
    // Table row 23 - Always-translate setting should not auto-translate.
    testPage: SPANISH_PAGE_UNDECLARED_SHORT_URL,
    alwaysTranslateLanguages: "es",
    buttonShown: true,
    manualPanelSourceLanguage: "es",
    message:
      "A language was identified, but it had such low confidence that only the button should be shown.",
  },
  {
    // Table row 23 - Offer path should not auto-offer.
    testPage: SPANISH_PAGE_UNDECLARED_SHORT_URL,
    buttonShown: true,
    manualPanelSourceLanguage: "es",
    message:
      "A language was identified, but it had such low confidence that only the button should be shown.",
  },
  {
    // Table row 24.
    testPage: SPANISH_PAGE_UNDECLARED_SHORT_URL,
    webLanguages: ["es"],
    buttonHidden: true,
    manualPanelSourceLanguage: "es",
    message:
      "There is no HTML language tag, and the low-confidence identified language matches a user language. Hide the button.",
  },
  {
    // Table row 25.
    testPage: SPANISH_PAGE_UNDECLARED_SHORT_URL,
    languagePairs: LANGUAGE_PAIRS_WITHOUT_SPANISH,
    buttonHidden: true,
    manualPanelSourceLanguage: "es",
    message:
      "There is no HTML language tag, and the low-confidence identified language is unsupported. Hide the button.",
  },
];

add_task(async function test_language_identification_behavior() {
  for (const [caseNo, testCase] of Object.entries(cases)) {
    const {
      testPage,
      testHtml,
      message,
      languagePairs,
      webLanguages,
      alwaysTranslateLanguages,
      neverTranslateLanguages,
      translatePage,
      offerTranslation,
      buttonShown,
      buttonHidden,
      manualPanelSourceLanguage,
      skipPageContentAssertion,
    } = testCase;
    info(`Testing Case ${Number(caseNo) + 1}`);
    TranslationsParent.testAutomaticPopup = true;

    // Handle this manually instead of using FullPageTranslationsTestUtils.waitForPanelPopupEvent
    // as we may not actually get a popupshown event and this leads to an error on test shutdown:
    // "popupshown listener on #full-page-translations-panel not removed before the end of test"
    let wasPopupShown = false;
    window.FullPageTranslationsPanel.elements; // De-lazify the panel.
    const { promise: popupShown, resolve } = Promise.withResolvers();
    const panel = window.document.getElementById(
      "full-page-translations-panel"
    );
    function handlePopupShown() {
      wasPopupShown = true;
      panel.removeEventListener("popupshown", handlePopupShown);
      resolve();
    }
    panel.addEventListener("popupshown", handlePopupShown);

    let pageState;
    try {
      pageState = await loadTestPage({
        page: testPage,
        html: testHtml,
        languagePairs: languagePairs ?? LANGUAGE_PAIRS,
        webLanguages,
        autoDownloadFromRemoteSettings: true,
        contentEagerMode: true,
        prefs: [
          [
            "browser.translations.alwaysTranslateLanguages",
            alwaysTranslateLanguages,
          ],
          [
            "browser.translations.neverTranslateLanguages",
            neverTranslateLanguages,
          ],
        ],
      });

      const { runInPage, win } = pageState;

      let outcomes = 0;
      if (buttonShown) {
        outcomes++;
      }
      if (buttonHidden) {
        outcomes++;
      }
      if (offerTranslation) {
        outcomes++;
      }
      if (translatePage) {
        outcomes++;
      }
      if (outcomes !== 1) {
        throw new Error("Expected only 1 main outcome.");
      }

      if (!buttonHidden) {
        await FullPageTranslationsTestUtils.assertTranslationsButton(
          {
            button: true,
            circleArrows: false,
            locale: translatePage,
            icon: true,
          },
          offerTranslation ? "The translation button is visible" : message
        );
      } else {
        await FullPageTranslationsTestUtils.assertTranslationsButton(
          { button: false },
          "The translations button is not visible."
        );
      }

      if (translatePage) {
        await FullPageTranslationsTestUtils.assertAllPageContentIsTranslated({
          fromLanguage: translatePage,
          toLanguage: "en",
          runInPage,
          message,
        });
        await FullPageTranslationsTestUtils.assertPageH1TitleIsTranslated({
          fromLanguage: translatePage,
          toLanguage: "en",
          runInPage,
          message:
            "The page's H1's title should be translated because it intersects with the viewport.",
        });

        if (
          testPage === SPANISH_PAGE_SHORT_URL ||
          testPage === SPANISH_PAGE_MISMATCH_SHORT_URL
        ) {
          await FullPageTranslationsTestUtils.assertPageFinalParagraphTitleIsTranslated(
            {
              fromLanguage: translatePage,
              toLanguage: "en",
              runInPage,
              message:
                "The page's final paragraph's title should be translated because it intersects with the viewport.",
            }
          );
        } else {
          await FullPageTranslationsTestUtils.assertPageFinalParagraphTitleIsNotTranslated(
            {
              runInPage,
              message:
                "Attribute translations are always lazy based on intersection, so the final paragraph's title should remain untranslated.",
            }
          );
        }
      } else if (!skipPageContentAssertion) {
        await FullPageTranslationsTestUtils.assertPageIsNotTranslated(
          runInPage,
          message
        );
      }

      if (offerTranslation) {
        await popupShown;
        ok(wasPopupShown, message);
        FullPageTranslationsTestUtils.assertSelectedFromLanguage({
          win,
          langTag: offerTranslation,
        });
        FullPageTranslationsTestUtils.assertSelectedToLanguage({
          win,
          langTag: "en",
        });
      } else {
        is(wasPopupShown, false, "A translation was not offered");
      }

      if (manualPanelSourceLanguage) {
        await FullPageTranslationsTestUtils.openPanel({
          win,
          openFromAppMenu: true,
        });

        const { docLangTag, isDocLangTagSupported } =
          getTranslationsParent(win).languageState.detectedLanguages;
        is(
          docLangTag,
          manualPanelSourceLanguage,
          `The source language is resolved after opening the panel manually: ${message}`
        );

        if (isDocLangTagSupported) {
          FullPageTranslationsTestUtils.assertPanelViewIntro();
          FullPageTranslationsTestUtils.assertSelectedFromLanguage({
            win,
            langTag: manualPanelSourceLanguage,
          });
        } else {
          FullPageTranslationsTestUtils.assertPanelViewUnsupportedLanguage();
        }
      }
    } finally {
      TranslationsParent.testAutomaticPopup = false;
      panel.removeEventListener("popupshown", handlePopupShown);
      await pageState?.cleanup();
    }
  }
});

/**
 * This test case tests the behavior when the page has no HTML language tag
 * and the identified language is not supported by Translations.
 */
add_task(async function test_identified_language_unsupported() {
  info("Testing unsupported identified language with no HTML language tag");
  TranslationsParent.testAutomaticPopup = true;

  let wasPopupShown = false;
  window.FullPageTranslationsPanel.elements; // De-lazify the panel.

  const { resolve } = Promise.withResolvers();
  const panel = window.document.getElementById("full-page-translations-panel");

  function handlePopupShown() {
    wasPopupShown = true;
    panel.removeEventListener("popupshown", handlePopupShown);
    resolve();
  }
  panel.addEventListener("popupshown", handlePopupShown);

  const { cleanup, runInPage } = await loadTestPage({
    page: SPANISH_PAGE_UNDECLARED_URL,
    // Deliberately omit Spanish so that it is not supported.
    languagePairs: [
      { fromLang: "en", toLang: "fr" },
      { fromLang: "fr", toLang: "en" },
      { fromLang: "en", toLang: "uk" },
      { fromLang: "uk", toLang: "en" },
    ],
    autoDownloadFromRemoteSettings: true,
    contentEagerMode: true,
  });

  await FullPageTranslationsTestUtils.assertTranslationsButton(
    { button: false },
    "The translations button is not visible when the identified language is unsupported."
  );

  await FullPageTranslationsTestUtils.assertPageIsNotTranslated(
    runInPage,
    "No translation should occur when the identified language is unsupported."
  );

  is(
    wasPopupShown,
    false,
    "A translation was not offered for an unsupported identified language."
  );

  TranslationsParent.testAutomaticPopup = false;
  await cleanup();
});

add_task(async function test_norwegian_bokmal_offered_for_translation() {
  TranslationsParent.testAutomaticPopup = true;

  let wasPopupShown = false;
  window.FullPageTranslationsPanel.elements; // De-lazify the panel.
  const { promise: popupShown, resolve } = Promise.withResolvers();
  const panel = window.document.getElementById("full-page-translations-panel");
  function handlePopupShown() {
    wasPopupShown = true;
    panel.removeEventListener("popupshown", handlePopupShown);
    resolve();
  }
  panel.addEventListener("popupshown", handlePopupShown);

  const { cleanup, win } = await loadTestPage({
    html: html`
      <!DOCTYPE html>
      <html lang="nb">
        <head>
          <meta charset="utf-8" />
          <title>Translations Test</title>
          <style>
            div {
              margin: 10px auto;
              width: 300px;
            }
            p {
              margin: 47px 0;
              font-size: 21px;
              line-height: 2;
            }
          </style>
        </head>
        <body>
          <div>
            <header lang="en">
              The following is an excerpt from Norsk literaturhistorie for
              gymnasiet, lærerskoler og høiere folkeskoler, which is in the
              public domain
            </header>
            <p>
              Som nævnt var det mest i Bergen at vi merker noget til norsk
              åndsliv i den tid.
            </p>
            <p>
              Bergen var den største by i Norden, og den by i Norge som stod i
              livligst samkvem med utlandet.
            </p>
            <p>
              Her måtte de nye idéer derfor først vise sig. Herfra gik den
              "første literære fornyelse" ut.
            </p>
            <p>
              Bispen Geble Pederssøn i Bergen var vor første humanist. Han
              interesserte sig især for skolen i sin by.
            </p>
            <p>
              I Bergen var det også at interessen for Norges gamle historie
              holdt sig. Flere arbeidet med oversættelser av de gamle sagaer.
            </p>
            <p>
              Blandt dem skal vi især merke lagmand Mattis Størssøn († 1569),
              som gav et utdrag av de gamle kongesagaer.
            </p>
            <p>
              Han skrev også et klageskrift mot de tyske kjøbmænd. Han var en
              anset mand og regjeringen brukte ham til flere vigtige hverv.
            </p>
            <p>
              Mest kjendt av Bergens-humanistene var allikevel *Absalon
              Pederssøn
            </p>
            <p>Beyer*, Geble Pederssøns elev og fostersøn. Han studerte ved</p>
            <p>
              universitetene i Kjøbenhavn og Wittenberg, hvor han tok
              magistergraden.
            </p>
            <p>
              Siden blev han lektor ved stiftsskolen i Bergen og til slut
              slotsprest.
            </p>
            <p>Han døde i 1574.</p>
            <p>
              I sine 14 sidste leve-år førte Absalon Pederssøn en dagbok, som er
            </p>
            <p>
              bevart under navnet _Bergens kapitelsbog_. Han fortæller her de
              mindste
            </p>
            <p>småting, som f. eks. at et par elever fra stiftsskolen en</p>
            <p>
              søndagseftermiddag går i vinkjelderen istedenfor i kirken. Men
            </p>
            <p>
              småtingene gjør netop boken til et levende og egte kulturbillede
              fra
            </p>
            <p>
              Bergen i den tid. Desuten har Absalon Pederssøn skrevet en Norges
            </p>
            <p>beskrivelse.</p>
            <p>
              Den sidste bok er merkelig ved at forfatteren viser sterk
              nationalfølelse og med styrke uttaler sin sorg over Norges
              tilbakegang og sit haap om at landet igjen maa reise sig av
              dvalen. Han siger om Norge i gamle dager, at da „var hun udi agt
              og ære; da havde hun en guldkrone paa sit hoved og en forgyldt
              løve med en blodøks; — — da udbredte Norige sin magt og vinger,“
              og at „Noriges rige haver standet udi sin blomster og været et
              sterkt og mandigt rige blandt andre kongeriger; men,“ siger han
              senere: „Fra den dag Norige kom under Danmark og miste sin egen
              herre og konning, saa haver det og mist sin manddoms styrke og
              magt og begynder at blive gammel og graahærd og saa tung, at det
              ei kan bære sin egen uld. — — Idet at hun er vorden træt og gammel
              af seilas og formaar ikke mere at drage udenlands, haver hun i sin
              rasendes alderdom, i hvilken hun bliver til barn paa det ny igjen,
              tilbudet en stor hob af hansestæderne, at de maa ikke alene seile
              her i riget, men ogsaa garpe[15] plante sig fast blandt disse
              klipper, hvilke som haver faaet det norske sand i deres sko, at de
              vil ikke gjerne herud igjen, men vil dø derpaa, at bergefisk og
              norsk smør er udi deres hansestæder en god ret.“ Han mener om
              Norge, at „hun gaar paa krykker og stylter og vil snart falde
              omkuld. — — Dog kunde vel Norige engang vaagne op af søvne, dersom
              hun finge en regenter over sig; thi hun er ikke aldeles saa
              forfalden og forsvækket, at hun jo kunde komme til sin magt igjen.
              — — Udi folket er endnu noget af den gamle dyd, manddom og
              styrke.“
            </p>
          </div>
        </body>
      </html>
    `,
    languagePairs: [
      { fromLang: "nb", toLang: "en" },
      { fromLang: "en", toLang: "nb" },
    ],
  });

  await popupShown;
  ok(wasPopupShown, "Translation offered");
  FullPageTranslationsTestUtils.assertSelectedFromLanguage({
    win,
    langTag: "nb",
  });
  FullPageTranslationsTestUtils.assertSelectedToLanguage({
    win,
    langTag: "en",
  });

  TranslationsParent.testAutomaticPopup = false;
  panel.removeEventListener("popupshown", handlePopupShown);
  await cleanup();
});

add_task(
  async function test_norwegian_bokmal_offered_for_generic_norwegan_translation() {
    TranslationsParent.testAutomaticPopup = true;

    let wasPopupShown = false;
    window.FullPageTranslationsPanel.elements; // De-lazify the panel.
    const { promise: popupShown, resolve } = Promise.withResolvers();
    const panel = window.document.getElementById(
      "full-page-translations-panel"
    );
    function handlePopupShown() {
      wasPopupShown = true;
      panel.removeEventListener("popupshown", handlePopupShown);
      resolve();
    }
    panel.addEventListener("popupshown", handlePopupShown);

    const { cleanup, win } = await loadTestPage({
      html: html`
        <!DOCTYPE html>
        <html lang="no">
          <head>
            <meta charset="utf-8" />
          </head>
          <body>
            <h1>Hei!</h1>
            <p>Dette er et enkelt testdokument på norsk bokmål.</p>
          </body>
        </html>
      `,
      languagePairs: [
        { fromLang: "nb", toLang: "en" },
        { fromLang: "en", toLang: "nb" },
      ],
    });

    await popupShown;
    ok(wasPopupShown, "Translation offered");
    FullPageTranslationsTestUtils.assertSelectedFromLanguage({
      win,
      langTag: "nb",
    });
    FullPageTranslationsTestUtils.assertSelectedToLanguage({
      win,
      langTag: "en",
    });

    TranslationsParent.testAutomaticPopup = false;
    panel.removeEventListener("popupshown", handlePopupShown);
    await cleanup();
  }
);
