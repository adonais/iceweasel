/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* exported addPdfStructTreeTest */

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/accessible/tests/browser/shared-head.js",
  this
);
loadScripts(
  { name: "common.js", dir: MOCHITESTS_DIR },
  { name: "promisified-events.js", dir: MOCHITESTS_DIR }
);
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/toolkit/components/printing/tests/head.js",
  this
);
const pdfjsLib = ChromeUtils.importESModule("resource://pdf.js/build/pdf.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "resource://pdf.js/build/pdf.worker.mjs";

/**
 * The PDF struct tree doesn't contain text content itself. Instead, it uses a
 * node which refers to marked content in the PDF content stream using an id. In
 * the PDF content stream, marked content is delimited by a begin operator
 * specifying the id and an end operator. Rather than making individual tests
 * match up the ids and separately test the struct tree and content items, this
 * function finds marked content items and inserts their strings directly into a
 * .content array on the struct tree node.
 */
function simplifyStructTreeNode(node, contentItems) {
  if (node.type == "content") {
    // Find the associated content items and append their strings to
    // node.content.
    node.content = [];
    let inMarked = false;
    for (const item of contentItems) {
      if (item.type == "beginMarkedContentProps" && item.id == node.id) {
        inMarked = true;
        continue;
      }
      if (!inMarked) {
        continue;
      }
      if (item.str) {
        node.content.push(item.str);
        continue;
      }
      if (item.type == "endMarkedContent") {
        break;
      }
    }
    delete node.type;
    delete node.id;
  }
  if (node.children) {
    for (const child of node.children) {
      simplifyStructTreeNode(child, contentItems);
    }
  }
}

function addPdfTest(testName, doc, task, options = {}) {
  async function pdfTask(browser) {
    const helper = new PrintHelper(browser);
    await helper.startPrint();
    const file = helper.mockFilePicker("accessible_test.pdf");
    await helper.assertPrintToFile(file, () => {
      helper.click(helper.get("print-button"));
    });
    await helper.startPrint();
    const data = await IOUtils.read(file.path);
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    await task(pdf);
    file.remove(false);
    Services.prefs.clearUserPref("print_printer");
  }
  // Propagate the name of the test to our wrapper function so it shows up in
  // test run output.
  Object.defineProperty(pdfTask, "name", { value: testName });
  addAccessibleTask(doc, pdfTask, options);
}

/**
 * Add a PDF struct tree test.
 *
 * @param testName The name of the test to show in log output.
 * @param doc The markup to convert to PDF.
 * @param pageTrees An array of PDF struct trees for each page of the PDF.
 * @param options Options to pass to addAccessibleTask.
 */
function addPdfStructTreeTest(testName, doc, pageTrees, options = {}) {
  async function task(pdf) {
    for (let p = 0; p < pageTrees.length; ++p) {
      const pageNum = p + 1;
      const page = await pdf.getPage(pageNum);
      const actualTree = await page.getStructTree();
      const contentItems = (
        await page.getTextContent({ includeMarkedContent: true })
      ).items;
      simplifyStructTreeNode(actualTree, contentItems);
      SimpleTest.isDeeply(
        actualTree,
        pageTrees[p],
        `Page ${pageNum} struct tree correct`
      );
    }
  }
  addPdfTest(testName, doc, task, options);
}
