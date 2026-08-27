/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Check that the full page translation feature works.
 */
add_task(async function test_full_page_translation() {
  await autoTranslatePage({
    page: SPANISH_PAGE_URL,
    languagePairs: [
      { fromLang: "es", toLang: "en" },
      { fromLang: "en", toLang: "es" },
    ],
    contentEagerMode: true,
    runInPage: async TranslationsTest => {
      const selectors = TranslationsTest.getSelectors();

      await TranslationsTest.assertTranslationResult(
        "The main title gets translated.",
        selectors.getH1,
        "DON QUIJOTE DE LA MANCHA [es to en]"
      );

      await TranslationsTest.assertTranslationResult(
        "The final paragraph gets translated even though it is out of the viewport.",
        selectors.getFinalParagraph,
        "— PUES, AUNQUE MOVÁIS MÁS BRAZOS QUE LOS DEL GIGANTE BRIAREO, ME LO HABÉIS DE PAGAR. [es to en]"
      );

      selectors.getH1().innerText = "Este es un titulo";

      await TranslationsTest.assertTranslationResult(
        "Mutations get tracked",
        selectors.getH1,
        "ESTE ES UN TITULO [es to en]"
      );

      await TranslationsTest.assertTranslationResult(
        "Other languages do not get translated.",
        selectors.getHeader,
        "The following is an excerpt from Don Quijote de la Mancha, which is in the public domain"
      );
    },
  });
});

/**
 * Check that a <select> element's <option> values are properly populated post translation.
 */
add_task(async function test_full_page_translation_of_select() {
  await autoTranslatePage({
    appLocales: ["es"],
    html: /* html */ `
      <!doctype html>
      <html lang="en">
        <body>
          <h1 id="heading">Title</h1>
          <p>
            This page contains enough English text for language detection to
            recognize it correctly before translating this menu's options.
          </p>
          <select id="select">
            <option value="Red">Red</option>
            <option value="blue" selected="">Blue</option>
            <option>Green</option>
          </select>
        </body>
      </html>
    `,
    languagePairs: [
      { fromLang: "en", toLang: "es" },
      { fromLang: "es", toLang: "en" },
    ],
    runInPage: async TranslationsTest => {
      const { document } = content;

      await TranslationsTest.assertTranslationResult(
        "The surrounding page content is translated.",
        () => document.querySelector("#heading"),
        "TITLE [en to es]"
      );

      const select = document.querySelector("#select");
      await TranslationsTest.assertHtmlMatches(
        select,
        /* html */ `
          <select id="select">
            <option value="Red">RED [en to es]</option>
            <option value="blue" selected="">BLUE [en to es]</option>
            <option value="Green">GREEN [en to es]</option>
          </select>
        `,
        "The select element and its options are translated."
      );
      is(select.value, "blue", "The selected value is preserved.");
      is(
        select.openOrClosedShadowRoot.querySelector("label").textContent,
        "BLUE [en to es]",
        "The select's visible label is translated."
      );
    },
  });
});

/**
 * Check that translatable UAWidget shadow hosts are correctly translated.
 */
add_task(async function test_full_page_translation_of_ua_widget_hosts() {
  await autoTranslatePage({
    appLocales: ["es"],
    html: /* html */ `
      <!doctype html>
      <html lang="en">
        <body>
          <h1 id="heading">Title</h1>
          <p>
            This page contains enough English text for language detection to
            recognize it correctly before translating native control content.
          </p>
          <select id="select">
            <option value="red">Red</option>
            <option value="blue" selected="">Blue</option>
          </select>
          <details id="details" open="">
            <summary>Summary</summary>
            <p>Panel content.</p>
          </details>
          <marquee id="marquee">Scrolling message.</marquee>
          <textarea id="textarea" placeholder="Write here">Do not translate.</textarea>
          <input id="text-input" type="text" placeholder="Search here">
          <input id="button" type="button" title="Continue" value="Continue">
        </body>
      </html>
    `,
    languagePairs: [
      { fromLang: "en", toLang: "es" },
      { fromLang: "es", toLang: "en" },
    ],
    runInPage: async TranslationsTest => {
      const { document } = content;

      await TranslationsTest.assertTranslationResult(
        "The surrounding page content is translated.",
        () => document.querySelector("#heading"),
        "TITLE [en to es]"
      );

      for (const id of [
        "select",
        "details",
        "marquee",
        "textarea",
        "text-input",
      ]) {
        ok(
          document.querySelector(`#${id}`).openOrClosedShadowRoot?.isUAWidget(),
          `The ${id} element has a native UA shadow root.`
        );
      }

      await TranslationsTest.assertHtmlMatches(
        document.querySelector("#select"),
        /* html */ `
          <select id="select">
            <option value="red">RED [en to es]</option>
            <option value="blue" selected="">BLUE [en to es]</option>
          </select>
        `,
        "Select options are translated."
      );
      await TranslationsTest.assertHtmlMatches(
        document.querySelector("#details"),
        /* html */ `
          <details id="details" open="">
            <summary>SUMMARY [en to es]</summary>
            <p>PANEL CONTENT. [en to es]</p>
          </details>
        `,
        "Details content is translated."
      );
      await TranslationsTest.assertHtmlMatches(
        document.querySelector("#marquee"),
        `<marquee id="marquee">SCROLLING MESSAGE. [en to es]</marquee>`,
        "Marquee content is translated."
      );
      await TranslationsTest.assertHtmlMatches(
        document.querySelector("#textarea"),
        `<textarea id="textarea" placeholder="WRITE HERE [en to es]">Do not translate.</textarea>`,
        "Textarea attributes are translated but its value is not."
      );
      await TranslationsTest.assertHtmlMatches(
        document.querySelector("#text-input"),
        `<input id="text-input" type="text" placeholder="SEARCH HERE [en to es]">`,
        "Text input attributes are translated."
      );
      await TranslationsTest.assertHtmlMatches(
        document.querySelector("#button"),
        `<input id="button" type="button" title="CONTINUE [en to es]" value="CONTINUE [en to es]">`,
        "Input button attributes are translated."
      );

      document.querySelector("#marquee").stop();
    },
  });
});

/**
 * Check that full-page translation with selected text in an <input> element does not crash the tab (Bug 2028086).
 */
add_task(async function test_full_page_translation_with_selected_text_input() {
  const { cleanup, runInPage } = await loadTestPage({
    appLocales: ["es"],
    autoDownloadFromRemoteSettings: true,
    html: /* html */ `
      <!doctype html>
      <html lang="en">
        <body>
          <input
            id="input"
            type="text"
            autofocus=""
            onfocus="this.select()"
            value="Do not translate"
          >
          <h1 id="heading">Title</h1>
          <p>
            This page contains enough English text for language detection to
            recognize it correctly before translating the rest of the page.
          </p>
        </body>
      </html>
    `,
    languagePairs: [
      { fromLang: "en", toLang: "es" },
      { fromLang: "es", toLang: "en" },
    ],
  });

  try {
    await runInPage(async TranslationsTest => {
      const { document } = content;
      const input = document.querySelector("#input");

      await TranslationsTest.waitForCondition(
        () =>
          input.openOrClosedShadowRoot?.isUAWidget() &&
          document.activeElement === input &&
          input.selectionStart === 0 &&
          input.selectionEnd === input.value.length,
        "Waiting for the focused text input to select its value."
      );
    });

    await runInPage(async () => {
      const input = content.document.querySelector("#input");

      is(
        input.selectionStart,
        0,
        "The input selection starts at the beginning."
      );
      is(
        input.selectionEnd,
        input.value.length,
        "The input selection ends at the end of the value."
      );
    });

    await getTranslationsParent().translate(
      { sourceLanguage: "en", targetLanguage: "es" },
      false
    );

    await runInPage(async TranslationsTest => {
      const { document } = content;
      const input = document.querySelector("#input");

      await TranslationsTest.assertTranslationResult(
        "The surrounding page content is translated.",
        () => document.querySelector("#heading"),
        "TITLE [en to es]"
      );

      is(
        input.value,
        "Do not translate",
        "Text input values are not translated."
      );
      is(
        input.selectionStart,
        0,
        "The input selection starts at the beginning."
      );
      is(
        input.selectionEnd,
        input.value.length,
        "The input selection ends at the end of the value."
      );
    });
  } finally {
    await cleanup();
  }
});

/**
 * Check that the full page translation feature doesn't translate pages in the app's
 * locale.
 */
add_task(async function test_about_translations_enabled() {
  const { appLocaleAsBCP47 } = Services.locale;
  if (!appLocaleAsBCP47.startsWith("en")) {
    console.warn(
      "This test assumes to be running in an 'en' app locale, however the app locale " +
        `is set to ${appLocaleAsBCP47}. Skipping the test.`
    );
    ok(true, "Skipping test.");
    return;
  }

  await autoTranslatePage({
    page: ENGLISH_PAGE_URL,
    languagePairs: [
      { fromLang: "es", toLang: "en" },
      { fromLang: "en", toLang: "es" },
    ],
    runInPage: async () => {
      const { document } = content;

      for (let i = 0; i < 5; i++) {
        // There is no way to directly check the non-existence of a translation, as
        // the translations engine works async, and you can't dispatch a CustomEvent
        // to listen for translations, as this script runs after the initial translations
        // check. So resort to a setTimeout and check a few times. This relies on timing,
        // but _cannot fail_ if it's working correctly. It _will most likely fail_ if
        // this page accidentally gets translated.

        const timeout = 10;

        info("Waiting for the timeout.");
        // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
        await new Promise(resolve => setTimeout(resolve, timeout));
        is(
          document.querySelector("h1").innerText,
          `"The Wonderful Wizard of Oz" by L. Frank Baum`,
          `The page remains not translated after ${(i + 1) * timeout}ms.`
        );
      }
    },
  });
});

/**
 * This test case ensures that the language is correctly identified as Spanish
 * when loading the NO_LANGUAGE_URL, and the page is translated just the same
 * as though it had a language tag specified in the markup.
 */
add_task(async function test_language_identification_for_page_translation() {
  await autoTranslatePage({
    page: NO_LANGUAGE_URL,
    languagePairs: [
      { fromLang: "es", toLang: "en" },
      { fromLang: "en", toLang: "es" },
    ],
    contentEagerMode: true,
    runInPage: async TranslationsTest => {
      const selectors = TranslationsTest.getSelectors();

      await TranslationsTest.assertTranslationResult(
        "The main title gets translated.",
        selectors.getH1,
        "DON QUIJOTE DE LA MANCHA [es to en]"
      );

      await TranslationsTest.assertTranslationResult(
        "The final paragraph gets translated even though it is out of the viewport.",
        selectors.getFinalParagraph,
        "— PUES, AUNQUE MOVÁIS MÁS BRAZOS QUE LOS DEL GIGANTE BRIAREO, ME LO HABÉIS DE PAGAR. [es to en]"
      );

      selectors.getH1().innerText = "Este es un titulo";

      await TranslationsTest.assertTranslationResult(
        "Mutations get tracked",
        selectors.getH1,
        "ESTE ES UN TITULO [es to en]"
      );

      await TranslationsTest.assertTranslationResult(
        "Other languages do not get translated.",
        selectors.getHeader,
        "The following is an excerpt from Don Quijote de la Mancha, which is in the public domain"
      );
    },
  });
});
