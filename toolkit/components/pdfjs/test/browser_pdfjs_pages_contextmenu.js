/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/toolkit/content/tests/browser/common/mockTransfer.js",
  this
);

const MockFilePicker = SpecialPowers.MockFilePicker;
const { promise: filePickerPromise, resolve: resolveFilePicker } =
  Promise.withResolvers();
add_setup(async function () {
  MockFilePicker.init();
  MockFilePicker.showCallback = function (fp) {
    resolveFilePicker(fp.defaultString);
    return MockFilePicker.returnCancel;
  };
  registerCleanupFunction(function () {
    MockFilePicker.cleanup();
  });
});

const PDFJS_PAGES_MENUITEMS = [
  "context-pdfjs-copy-page",
  "context-pdfjs-cut-page",
  "context-pdfjs-delete-page",
  "context-pdfjs-save-page",
  "context-sep-pdfjs-save-page",
];

/**
 * Open a context menu and get the pdfjs page entries.
 *
 * @param {object} browser
 * @param {object} box
 * @param {boolean} waitForStatesChanged
 * @returns {Promise<Map<string,HTMLElement>>} the pdfjs page menu entries.
 */
function getPagesContextMenuItems(browser, box, waitForStatesChanged = false) {
  return openContextMenuAndGetItems(
    browser,
    box,
    PDFJS_PAGES_MENUITEMS,
    waitForStatesChanged
  );
}

async function getThumbnailBox(browser, index) {
  info(`Getting thumbnail box for page index ${index}`);
  return SpecialPowers.spawn(browser, [index], async function (idx) {
    const { ContentTaskUtils } = ChromeUtils.importESModule(
      "resource://testing-common/ContentTaskUtils.sys.mjs"
    );
    await ContentTaskUtils.waitForCondition(
      () =>
        !!content.document.querySelectorAll("#thumbnailsView .thumbnail")[idx],
      "Thumbnail must be present"
    );
    const el = content.document.querySelectorAll("#thumbnailsView .thumbnail")[
      idx
    ];
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  });
}

async function selectPage(browser, index) {
  info(`Selecting page index ${index}`);
  await SpecialPowers.spawn(browser, [index], async function (idx) {
    const { ContentTaskUtils } = ChromeUtils.importESModule(
      "resource://testing-common/ContentTaskUtils.sys.mjs"
    );
    const { document } = content;
    await ContentTaskUtils.waitForCondition(
      () =>
        !!document.querySelectorAll(
          "#thumbnailsView .thumbnail input[type=checkbox]"
        )[idx],
      "Checkbox must be present"
    );
    const checkbox = document.querySelectorAll(
      "#thumbnailsView .thumbnail input[type=checkbox]"
    )[idx];
    if (!checkbox.checked) {
      checkbox.click();
    }
    await ContentTaskUtils.waitForCondition(
      () => checkbox.checked,
      "Checkbox must be checked"
    );
  });
}

add_task(async function test_pages_context_menu() {
  makePDFJSHandler();

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async function (browser) {
      await SpecialPowers.pushPrefEnv({
        set: [["pdfjs.enableSplitMerge", true]],
      });

      await waitForPdfJSAllLayers(
        browser,
        TESTROOT + "file_pdfjs_numbered_pages.pdf",
        [
          [
            "annotationEditorLayer",
            "annotationLayer",
            "textLayer",
            "canvasWrapper",
          ],
          [
            "annotationEditorLayer",
            "annotationLayer",
            "textLayer",
            "canvasWrapper",
          ],
        ]
      );

      await waitForSelector(
        browser,
        "#viewerContainer",
        "Viewer container must be present"
      );
      // Without any pages selected, no pages context menu items should be visible.
      const viewerBox = await SpecialPowers.spawn(browser, [], async () => {
        const el = content.document.querySelector("#viewerContainer");
        const { x, y, width, height } = el.getBoundingClientRect();
        return { x, y, width, height };
      });

      let menuitems = await getPagesContextMenuItems(browser, viewerBox);
      Assert.ok(
        [...menuitems.values()].every(elmt => elmt.hidden),
        "No visible pages menuitem when no pages are selected"
      );
      await hideContextMenu();

      // Open the sidebar (thumbnails view).
      await click(browser, "#viewsManagerToggleButton");
      await waitForSelector(
        browser,
        "#thumbnailsView .thumbnail input[type=checkbox]",
        "Thumbnails with checkboxes must be visible"
      );

      // Select the first page.
      await selectPage(browser, 0);

      // Pages context menu items must be visible when a page is selected.
      let thumbnailBox = await getThumbnailBox(browser, 0);
      menuitems = await getPagesContextMenuItems(browser, thumbnailBox, true);
      assertMenuitems(menuitems, [
        "context-pdfjs-copy-page",
        "context-pdfjs-cut-page",
        "context-pdfjs-delete-page",
        "context-pdfjs-save-page",
      ]);

      // Copy the page: paste buttons must appear in the thumbnails view.
      let pagesEditedPromise = BrowserTestUtils.waitForContentEvent(
        browser,
        "pagesedited",
        false,
        null,
        true
      );
      await clickOnItem(browser, menuitems, "context-pdfjs-copy-page");
      await pagesEditedPromise;

      Assert.greater(
        await countElements(browser, ".thumbnailPasteButton"),
        0,
        "Paste buttons must appear after copy"
      );

      await clickOn(browser, "#viewsManagerStatusUndoButton");

      // Select the first page again (checkboxes were cleared by the copy).
      await selectPage(browser, 0);

      // Delete the page: the thumbnail count must decrease.
      const thumbnailCount = await countElements(
        browser,
        "#thumbnailsView .thumbnail"
      );
      thumbnailBox = await getThumbnailBox(browser, 0);
      menuitems = await getPagesContextMenuItems(browser, thumbnailBox, true);

      pagesEditedPromise = BrowserTestUtils.waitForContentEvent(
        browser,
        "pagesedited",
        false,
        null,
        true
      );
      await clickOnItem(browser, menuitems, "context-pdfjs-delete-page");
      await pagesEditedPromise;

      await TestUtils.waitForCondition(
        async () =>
          (await countElements(browser, "#thumbnailsView .thumbnail")) ===
          thumbnailCount - 1,
        "One thumbnail must have been removed after delete"
      );

      // Select the first page and cut it: count must decrease and paste buttons appear.
      await selectPage(browser, 0);

      const countAfterDelete = await countElements(
        browser,
        "#thumbnailsView .thumbnail"
      );
      thumbnailBox = await getThumbnailBox(browser, 0);
      menuitems = await getPagesContextMenuItems(browser, thumbnailBox, true);

      const cutEditedPromise = BrowserTestUtils.waitForContentEvent(
        browser,
        "pagesedited",
        false,
        null,
        true
      );
      await clickOnItem(browser, menuitems, "context-pdfjs-cut-page");
      await cutEditedPromise;

      await TestUtils.waitForCondition(
        async () =>
          (await countElements(browser, "#thumbnailsView .thumbnail")) ===
          countAfterDelete - 1,
        "One thumbnail must have been removed after cut"
      );
      Assert.greater(
        await countElements(browser, ".thumbnailPasteButton"),
        0,
        "Paste buttons must appear after cut"
      );

      // Select the first page and save: saveextractedpages event must fire.
      await selectPage(browser, 0);

      thumbnailBox = await getThumbnailBox(browser, 0);
      menuitems = await getPagesContextMenuItems(browser, thumbnailBox, true);

      const savePromise = BrowserTestUtils.waitForContentEvent(
        browser,
        "saveextractedpages",
        false,
        null,
        true
      );
      await clickOnItem(browser, menuitems, "context-pdfjs-save-page");
      await savePromise;

      await filePickerPromise;

      await waitForPdfJSClose(browser);
      await SpecialPowers.popPrefEnv();
    }
  );
});
