/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "http://example.com/browser/" + RELATIVE_DIR;
// Avoid mixed-content blocking when HTTPS-First upgrades the top-level page.
const HTTPS_TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;
const TARGET_URL = HTTPS_TESTROOT + "file_pdfjs_target.html";
const NESTED_IFRAME_URL = HTTPS_TESTROOT + "file_pdfjs_nested_iframe.html";
const IFRAME_PARENT_URL = TESTROOT + "file_pdfjs_iframe.html";
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

// This is a modified version from browser_contextmenuFillLogins.js.
async function openContextMenuAt(browser, x, y) {
  const contextMenu = document.getElementById("contentAreaContextMenu");

  const contextMenuShownPromise = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popupshown"
  );

  // Synthesize a contextmenu event to actually open the context menu.
  await BrowserTestUtils.synthesizeMouseAtPoint(
    x,
    y,
    {
      type: "contextmenu",
      button: 2,
    },
    browser
  );

  await contextMenuShownPromise;
  return contextMenu;
}

/**
 * Open a context menu and get the pdfjs entries
 *
 * @param {object} browser
 * @param {object} box
 * @returns {Promise<Map<string,HTMLElement>>} the pdfjs menu entries.
 */
function getContextMenuItems(browser, box) {
  return new Promise(resolve => {
    setTimeout(async () => {
      const { x, y, width, height } = box;
      const menuitems = [
        "context-pdfjs-undo",
        "context-pdfjs-redo",
        "context-sep-pdfjs-redo",
        "context-pdfjs-cut",
        "context-pdfjs-copy",
        "context-pdfjs-paste",
        "context-pdfjs-delete",
        "context-pdfjs-select-all",
        "context-sep-pdfjs-select-all",
        "context-pdfjs-highlight-selection",
        "context-pdfjs-comment-selection",
      ];

      await openContextMenuAt(browser, x + width / 2, y + height / 2);
      const results = new Map();
      for (const menuitem of menuitems) {
        const item = document.getElementById(menuitem);
        results.set(menuitem, item || null);
      }

      resolve(results);
    }, 0);
  });
}

/**
 * Open a context menu on the element corresponding to the given selector
 * and returs the pdfjs menu entries.
 *
 * @param {object} browser
 * @param {string} selector
 * @returns {Promise<Map<string,HTMLElement>>} the pdfjs menu entries.
 */
async function getContextMenuItemsOn(browser, selector) {
  const box = await SpecialPowers.spawn(
    browser,
    [selector],
    async function (selector) {
      const element = content.document.querySelector(selector);
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }
  );
  return getContextMenuItems(browser, box);
}

/**
 * Hide the context menu.
 */
async function hideContextMenu() {
  await new Promise(resolve =>
    setTimeout(async () => {
      const contextMenu = document.getElementById("contentAreaContextMenu");

      const popupHiddenPromise = BrowserTestUtils.waitForEvent(
        contextMenu,
        "popuphidden"
      );
      contextMenu.hidePopup();
      await popupHiddenPromise;
      resolve();
    }, 0)
  );
}

async function clickOnItem(browser, items, entry) {
  const editingPromise = BrowserTestUtils.waitForContentEvent(
    browser,
    "editingaction",
    false,
    null,
    true
  );
  const contextMenu = document.getElementById("contentAreaContextMenu");
  contextMenu.activateItem(items.get(entry));
  await editingPromise;
}

/**
 * Asserts that the enabled pdfjs menuitems are the expected ones.
 *
 * @param {Map<string,HTMLElement>} menuitems
 * @param {Array<string>} expected
 */
function assertMenuitems(menuitems, expected) {
  Assert.deepEqual(
    [...menuitems.values()]
      .filter(
        elmt =>
          !elmt.id.includes("-sep-") &&
          !elmt.hidden &&
          [null, "false"].includes(elmt.getAttribute("disabled"))
      )
      .map(elmt => elmt.id),
    expected
  );
}

async function waitAndCheckEmptyContextMenu(browser) {
  // check that PDF is opened with internal viewer
  await waitForPdfJSAllLayers(browser, TESTROOT + "file_pdfjs_test.pdf", [
    ["annotationEditorLayer", "annotationLayer", "textLayer", "canvasWrapper"],
    ["annotationEditorLayer", "textLayer", "canvasWrapper"],
  ]);

  const spanBox = await getSpanBox(browser, "and found references");
  const menuitems = await getContextMenuItems(browser, spanBox);

  // Nothing have been edited, hence the context menu doesn't contain any
  // pdf entries.
  Assert.ok(
    [...menuitems.values()].every(elmt => elmt.hidden),
    "No visible pdf menuitem"
  );
  await hideContextMenu();
}

// Text copy, paste, undo, redo, delete and select all in using the context
// menu.
add_task(async function test_copy_paste_undo_redo() {
  makePDFJSHandler();

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async function (browser) {
      SpecialPowers.clipboardCopyString("");

      await SpecialPowers.pushPrefEnv({
        set: [["pdfjs.annotationEditorMode", 0]],
      });

      await waitAndCheckEmptyContextMenu(browser);
      const spanBox = await getSpanBox(browser, "and found references");

      await enableEditor(browser, "FreeText", 1);
      await addFreeText(browser, "hello", spanBox);

      // Unselect.
      await escape(browser);

      info("Wait for the editor to be unselected");
      await TestUtils.waitForCondition(
        async () => (await countElements(browser, ".selectedEditor")) !== 1
      );
      Assert.equal(await countElements(browser, ".selectedEditor"), 0);

      let menuitems = await getContextMenuItems(browser, spanBox);
      assertMenuitems(menuitems, [
        "context-pdfjs-undo", // Last created editor is undoable
        "context-pdfjs-select-all", // and selectable.
      ]);
      // Undo.
      await clickOnItem(browser, menuitems, "context-pdfjs-undo");

      await TestUtils.waitForCondition(
        async () => (await countElements(browser, ".freeTextEditor")) !== 2
      );

      Assert.equal(
        await countElements(browser, ".freeTextEditor"),
        1,
        "The FreeText editor must have been removed"
      );

      menuitems = await getContextMenuItems(browser, spanBox);

      // The editor removed thanks to "undo" is now redoable
      assertMenuitems(menuitems, [
        "context-pdfjs-redo",
        "context-pdfjs-select-all",
      ]);
      await clickOnItem(browser, menuitems, "context-pdfjs-redo");

      await TestUtils.waitForCondition(
        async () => (await countElements(browser, ".freeTextEditor")) !== 1
      );

      Assert.equal(
        await countElements(browser, ".freeTextEditor"),
        2,
        "The FreeText editor must have been added back"
      );

      await clickOn(browser, "#pdfjs_internal_editor_0");
      menuitems = await getContextMenuItemsOn(
        browser,
        "#pdfjs_internal_editor_0"
      );

      assertMenuitems(menuitems, [
        "context-pdfjs-undo",
        "context-pdfjs-cut",
        "context-pdfjs-copy",
        "context-pdfjs-delete",
        "context-pdfjs-select-all",
      ]);

      await clickOnItem(browser, menuitems, "context-pdfjs-cut");

      await TestUtils.waitForCondition(
        async () => (await countElements(browser, ".freeTextEditor")) !== 2
      );

      Assert.equal(
        await countElements(browser, ".freeTextEditor"),
        1,
        "The FreeText editor must have been cut"
      );

      menuitems = await getContextMenuItems(browser, spanBox);
      assertMenuitems(menuitems, [
        "context-pdfjs-undo",
        "context-pdfjs-paste",
        "context-pdfjs-select-all",
      ]);

      await clickOnItem(browser, menuitems, "context-pdfjs-paste");

      await TestUtils.waitForCondition(
        async () => (await countElements(browser, ".freeTextEditor")) !== 1
      );

      Assert.equal(
        await countElements(browser, ".freeTextEditor"),
        2,
        "The FreeText editor must have been pasted"
      );

      await clickOn(browser, "#pdfjs_internal_editor_1");
      menuitems = await getContextMenuItemsOn(
        browser,
        "#pdfjs_internal_editor_1"
      );

      assertMenuitems(menuitems, [
        "context-pdfjs-undo",
        "context-pdfjs-cut",
        "context-pdfjs-copy",
        "context-pdfjs-paste",
        "context-pdfjs-delete",
        "context-pdfjs-select-all",
      ]);

      await clickOnItem(browser, menuitems, "context-pdfjs-delete");

      await TestUtils.waitForCondition(
        async () => (await countElements(browser, ".freeTextEditor")) !== 2
      );

      Assert.equal(
        await countElements(browser, ".freeTextEditor"),
        1,
        "The FreeText editor must have been deleted"
      );

      menuitems = await getContextMenuItems(browser, spanBox);
      await clickOnItem(browser, menuitems, "context-pdfjs-paste");

      await TestUtils.waitForCondition(
        async () => (await countElements(browser, ".freeTextEditor")) !== 1
      );

      Assert.equal(
        await countElements(browser, ".freeTextEditor"),
        2,
        "The FreeText editor must have been pasted"
      );

      await clickOn(browser, "#pdfjs_internal_editor_2");
      menuitems = await getContextMenuItemsOn(
        browser,
        "#pdfjs_internal_editor_2"
      );

      await clickOnItem(browser, menuitems, "context-pdfjs-copy");

      menuitems = await getContextMenuItemsOn(
        browser,
        "#pdfjs_internal_editor_2"
      );
      await clickOnItem(browser, menuitems, "context-pdfjs-paste");

      await TestUtils.waitForCondition(
        async () => (await countElements(browser, ".freeTextEditor")) !== 2
      );

      Assert.equal(
        await countElements(browser, ".freeTextEditor"),
        3,
        "The FreeText editor must have been pasted"
      );

      menuitems = await getContextMenuItems(browser, spanBox);
      await clickOnItem(browser, menuitems, "context-pdfjs-select-all");
      menuitems = await getContextMenuItems(browser, spanBox);
      await clickOnItem(browser, menuitems, "context-pdfjs-delete");

      await TestUtils.waitForCondition(
        async () => (await countElements(browser, ".freeTextEditor")) !== 3
      );

      Assert.equal(
        await countElements(browser, ".freeTextEditor"),
        0,
        "All the FreeText editors must have been deleted"
      );

      await waitForPdfJSClose(browser);
      await SpecialPowers.popPrefEnv();
    }
  );
});

add_task(async function test_highlight_selection() {
  makePDFJSHandler();

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async function (browser) {
      await SpecialPowers.pushPrefEnv({
        set: [
          ["pdfjs.annotationEditorMode", 0],
          ["pdfjs.enableComment", false],
        ],
      });

      await waitAndCheckEmptyContextMenu(browser);
      const spanBox = await getSpanBox(browser, "and found references");

      const changePromise = BrowserTestUtils.waitForContentEvent(
        browser,
        "editingstateschanged",
        false,
        null,
        true
      );
      await clickAt(
        browser,
        spanBox.x + spanBox.width / 2,
        spanBox.y + spanBox.height / 2,
        2
      );
      await changePromise;
      await TestUtils.waitForTick();

      const mozBox = await getSpanBox(browser, "Mozilla automated testing");
      const menuitems = await getContextMenuItems(browser, mozBox);

      assertMenuitems(menuitems, ["context-pdfjs-highlight-selection"]);

      const telemetryPromise = BrowserTestUtils.waitForContentEvent(
        browser,
        "reporttelemetry",
        false,
        null,
        true
      );
      await clickOnItem(
        browser,
        menuitems,
        "context-pdfjs-highlight-selection"
      );
      await telemetryPromise;

      Assert.equal(
        await countElements(browser, ".highlightEditor"),
        1,
        "An highlight editor must have been added"
      );

      await waitForPdfJSClose(browser);
    }
  );
});

add_task(async function test_comment_selection() {
  makePDFJSHandler();

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:blank" },
    async function (browser) {
      await SpecialPowers.pushPrefEnv({
        set: [
          ["pdfjs.annotationEditorMode", 0],
          ["pdfjs.enableComment", true],
        ],
      });

      await waitAndCheckEmptyContextMenu(browser);
      const spanBox = await getSpanBox(browser, "and found references");

      const changePromise = BrowserTestUtils.waitForContentEvent(
        browser,
        "editingstateschanged",
        false,
        null,
        true
      );
      await clickAt(
        browser,
        spanBox.x + spanBox.width / 2,
        spanBox.y + spanBox.height / 2,
        2
      );
      await changePromise;
      await TestUtils.waitForTick();

      const mozBox = await getSpanBox(browser, "Mozilla automated testing");
      const menuitems = await getContextMenuItems(browser, mozBox);

      assertMenuitems(menuitems, [
        "context-pdfjs-highlight-selection",
        "context-pdfjs-comment-selection",
      ]);

      const telemetryPromise = BrowserTestUtils.waitForContentEvent(
        browser,
        "reporttelemetry",
        false,
        null,
        true
      );
      await clickOnItem(browser, menuitems, "context-pdfjs-comment-selection");
      await telemetryPromise;

      await waitForSelector(
        browser,
        "#commentManagerDialog",
        "The comment dialog must be visible"
      );

      await waitForPdfJSClose(browser);
    }
  );
});

add_task(async function test_editing_contextmenu_in_bfcache() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TARGET_URL },
    async function (browser) {
      const browsingContext = browser.browsingContext;
      await getContextMenuItemsOn(browser, "#target");

      const pdfJsContextMenu = gContextMenu.pdfjsContextMenu;
      const windowGlobal = gContextMenu.actor.manager;
      is(
        windowGlobal,
        browsingContext.currentWindowGlobal,
        "The context menu belongs to the initial page"
      );
      await hideContextMenu();
      const sendSpy = sinon.spy(
        windowGlobal.getActor("PdfJs"),
        "sendAsyncMessage"
      );

      try {
        const nextURL = `${TARGET_URL}?next`;
        const loaded = BrowserTestUtils.browserLoaded(browser, false, nextURL);
        await BrowserTestUtils.startLoadingURIString(browser, nextURL);
        await loaded;

        ok(windowGlobal.isInBFCache, "The context menu page is in the BFCache");
        ok(!windowGlobal.isActiveInTab, "The cached page isn't visible");

        pdfJsContextMenu.cmd("context-pdfjs-undo");
        pdfJsContextMenu.cmd("context-pdfjs-copy");
        is(sendSpy.callCount, 0, "No command was sent to the cached page");
      } finally {
        sendSpy.restore();
      }
    }
  );
});

// Drop commands after an ancestor frame navigates.
add_task(async function test_editing_contextmenu_in_stale_frame() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: NESTED_IFRAME_URL },
    async function (browser) {
      const middleFrame = browser.browsingContext.children[0];
      const innerFrame = middleFrame.children[0];
      await getContextMenuItemsOn(innerFrame, "#target");

      const pdfJsContextMenu = gContextMenu.pdfjsContextMenu;
      const windowGlobal = gContextMenu.actor.manager;
      is(
        windowGlobal,
        innerFrame.currentWindowGlobal,
        "The context menu belongs to the innermost frame"
      );
      await hideContextMenu();
      const sendSpy = sinon.spy(
        windowGlobal.getActor("PdfJs"),
        "sendAsyncMessage"
      );

      try {
        const loaded = BrowserTestUtils.browserLoaded(
          browser,
          true,
          TARGET_URL
        );
        await SpecialPowers.spawn(middleFrame, [TARGET_URL], url => {
          content.location = url;
        });
        await loaded;

        ok(
          windowGlobal.isCurrentGlobal,
          "The stale frame is still the current global of its own context"
        );
        ok(!windowGlobal.isActiveInTab, "The stale frame isn't visible");

        pdfJsContextMenu.cmd("context-pdfjs-undo");
        pdfJsContextMenu.cmd("context-pdfjs-copy");
        is(sendSpy.callCount, 0, "No command was sent to the stale frame");
      } finally {
        sendSpy.restore();
      }

      // Reset focus after the frame navigation.
      await SpecialPowers.spawn(browser, [], () => content.focus());
    }
  );
});

add_task(async function test_editing_contextmenu_in_iframe() {
  makePDFJSHandler();

  await SpecialPowers.pushPrefEnv({
    set: [["pdfjs.annotationEditorMode", 0]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: IFRAME_PARENT_URL },
    async function (browser) {
      SpecialPowers.clipboardCopyString("");

      const iframe = browser.browsingContext.children[0];
      await waitForPdfJSLayers(iframe, [
        [
          "annotationEditorLayer",
          "annotationLayer",
          "textLayer",
          "canvasWrapper",
        ],
      ]);

      const spanBox = await getSpanBox(iframe, "and found references");

      await enableEditor(iframe, "FreeText", 1);
      await addFreeText(iframe, "hello", spanBox);
      await escape(iframe);

      info("Wait for the editor to be unselected");
      await TestUtils.waitForCondition(
        async () => (await countElements(iframe, ".selectedEditor")) === 0
      );

      let menuitems = await getContextMenuItems(iframe, spanBox);
      assertMenuitems(menuitems, [
        "context-pdfjs-undo",
        "context-pdfjs-select-all",
      ]);

      await clickOnItem(iframe, menuitems, "context-pdfjs-undo");
      await TestUtils.waitForCondition(
        async () => (await countElements(iframe, ".freeTextEditor")) !== 2
      );
      Assert.equal(
        await countElements(iframe, ".freeTextEditor"),
        1,
        "The FreeText editor must have been removed"
      );

      menuitems = await getContextMenuItems(iframe, spanBox);
      assertMenuitems(menuitems, [
        "context-pdfjs-redo",
        "context-pdfjs-select-all",
      ]);

      await clickOnItem(iframe, menuitems, "context-pdfjs-redo");
      await TestUtils.waitForCondition(
        async () => (await countElements(iframe, ".freeTextEditor")) !== 1
      );
      Assert.equal(
        await countElements(iframe, ".freeTextEditor"),
        2,
        "The FreeText editor must have been added back"
      );

      await clickOn(iframe, "#pdfjs_internal_editor_0");
      menuitems = await getContextMenuItemsOn(
        iframe,
        "#pdfjs_internal_editor_0"
      );
      await clickOnItem(iframe, menuitems, "context-pdfjs-cut");

      await TestUtils.waitForCondition(
        async () => (await countElements(iframe, ".freeTextEditor")) !== 2
      );
      Assert.equal(
        await countElements(iframe, ".freeTextEditor"),
        1,
        "The FreeText editor must have been cut"
      );

      menuitems = await getContextMenuItems(iframe, spanBox);
      await clickOnItem(iframe, menuitems, "context-pdfjs-paste");

      await TestUtils.waitForCondition(
        async () => (await countElements(iframe, ".freeTextEditor")) !== 1
      );
      Assert.equal(
        await countElements(iframe, ".freeTextEditor"),
        2,
        "The FreeText editor must have been pasted"
      );

      await waitForPdfJSClose(iframe);
    }
  );

  await SpecialPowers.popPrefEnv();
});
