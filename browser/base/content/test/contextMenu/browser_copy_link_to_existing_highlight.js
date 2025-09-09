/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function openContextMenuAtSelector(browser, selector) {
  const menu = document.getElementById("contentAreaContextMenu");
  const shown = BrowserTestUtils.waitForEvent(menu, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    selector,
    { type: "contextmenu", button: 2 },
    browser
  );
  await shown;
  return menu;
}

function makeTestURI() {
  const html =
    `<p><span id="hello">Hello</span> ` +
    `<span id="foo">foo</span> <span id="bar">bar</span> ` +
    `<span id="baz">baz</span></p>`;
  const encoded = encodeURIComponent(html);
  return `data:text/html,${encoded}`;
}

async function waitForHighlight(browser) {
  await SpecialPowers.spawn(browser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content.document.fragmentDirective.getTextDirectiveRanges().length,
      "Fragment highlight range present"
    );
  });
}

/**
 * Opens the context menu at |selector|, asserts that “Copy Link to Highlight”
 * is visible + enabled, and verifies the clipboard content after clicking it.
 *
 * @param {Browser} browser         Remote browser for synth clicks
 * @param {String}  selector        CSS selector to right-click
 * @param {String}  testCase        Description used in ok() messages
 * @param {String}  textFragmentURL Expected clipboard text
 */
async function assertHighlightMenu(
  browser,
  selector,
  testCase,
  textFragmentURL = null
) {
  const menu = await openContextMenuAtSelector(browser, selector);
  const awaitPopupHidden = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  const copy = menu.querySelector("#context-copy-link-to-highlight");
  try {
    ok(!copy.hidden, `"Copy Link to Highlight" visible when ${testCase}`);
    ok(
      !copy.hasAttribute("disabled") ||
        copy.getAttribute("disabled") === "false",
      `"Copy Link to Highlight" enabled when ${testCase}`
    );

    if (textFragmentURL !== null) {
      // Click the item and verify clipboard; menu auto-closes.
      await SimpleTest.promiseClipboardChange(textFragmentURL, async () =>
        copy.closest("menupopup").activateItem(copy)
      );
    } else {
      menu.hidePopup();
    }
  } finally {
    // Ensure the menu is closed, even if the test failed.
    await awaitPopupHidden;
  }
}

add_task(async function test_existing_highlight_paths() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.text_fragments.enabled", true],
      ["dom.text_fragments.create_text_fragment.enabled", true],
    ],
  });
  const TEST_URI = makeTestURI();
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    `${TEST_URI}#:~:text=foo%20bar` // Load the page with a highlight
  );
  try {
    const browser = tab.linkedBrowser;
    await waitForHighlight(browser);

    // Case 1: click on selection outside highlight
    await SpecialPowers.spawn(browser, [], () => {
      const sel = content.getSelection();
      sel.removeAllRanges();
      const node = content.document.querySelector("#baz").firstChild; // “baz”
      const range = content.document.createRange();
      range.selectNodeContents(node);
      sel.addRange(range);
    });
    await assertHighlightMenu(
      browser,
      "#baz",
      "selection outside highlight",
      `${TEST_URI}#:~:text=baz`
    );

    // Case 2: click inside highlight, selection is outside of highlight, highlight takes precedence
    await assertHighlightMenu(
      browser,
      "#foo",
      "inside highlight (no selection)",
      `${TEST_URI}#:~:text=foo%20bar`
    );

    // Case 3: selection overlaps highlight, selection takes precedence
    await SpecialPowers.spawn(browser, [], () => {
      const sel = content.getSelection();
      sel.removeAllRanges();
      const startNode = content.document.querySelector("#hello").firstChild;
      const endNode = content.document.querySelector("#foo").firstChild;
      const range = content.document.createRange();
      range.setStart(startNode, 0);
      range.setEnd(endNode, 3);
      sel.addRange(range);
    });
    await assertHighlightMenu(
      browser,
      "#foo", // click on a section where there are both selection and highlight
      "selection overlaps highlight",
      `${TEST_URI}#:~:text=Hello%20foo`
    );
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
});
