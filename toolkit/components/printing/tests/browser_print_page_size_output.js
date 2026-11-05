/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Check that the PDF we write honors the CSS `@page { size }` of each page,
 * including a per-page orientation change
 * (print.save_as_pdf.use_page_rule_size_as_paper_size.enabled), rather than
 * the paper size in the print settings.
 */

const PAGE_SIZE_PREF =
  "print.save_as_pdf.use_page_rule_size_as_paper_size.enabled";

const pdfjsLib = ChromeUtils.importESModule("resource://pdf.js/build/pdf.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "resource://pdf.js/build/pdf.worker.mjs";

const LETTER = [612, 792];
const LABEL_4x6 = [288, 432];
const LABEL_6x4 = [432, 288];

/**
 * Read the size of every page of a PDF.
 *
 * @param {Uint8Array} data - the contents of the PDF.
 * @returns {Promise<number[][]>} the [width, height] in points of each page.
 */
async function readPageSizes(data) {
  let pdf = await pdfjsLib.getDocument({ data }).promise;
  let sizes = [];
  for (let i = 1; i <= pdf.numPages; ++i) {
    let { width, height } = (await pdf.getPage(i)).getViewport({ scale: 1 });
    sizes.push([Math.round(width), Math.round(height)]);
  }
  return sizes;
}

async function testPageRuleSizes(prefValue, expectedSizes) {
  await SpecialPowers.pushPrefEnv({ set: [[PAGE_SIZE_PREF, prefValue]] });
  await BrowserTestUtils.withNewTab(
    PrintHelper.getTestPageUrl("page_size_mixed.html"),
    async function (browser) {
      // The paper size the page sizes must win over.
      let data = await PrintHelper.printToPDF(browser, settings => {
        settings.paperSizeUnit = Ci.nsIPrintSettings.kPaperSizeInches;
        settings.paperId = "na_letter";
        settings.paperWidth = 8.5;
        settings.paperHeight = 11;
      });
      Assert.deepEqual(await readPageSizes(data), expectedSizes);
    }
  );
}

add_task(function testPageRuleSizesEnabled() {
  return testPageRuleSizes(true, [LABEL_4x6, LABEL_6x4, LABEL_4x6]);
});

add_task(function testPageRuleSizesDisabled() {
  return testPageRuleSizes(false, [LETTER, LETTER, LETTER]);
});
