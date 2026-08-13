/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

/* eslint-disable no-unused-vars */

"use strict";

// This head.js file is only imported by debugger mochitests.
// Anything that is meant to be used by tests of other panels should be moved to shared-head.js
// Also, any symbol that may conflict with other test symbols should stay in head.js
// (like EXAMPLE_URL)

const EXAMPLE_URL =
  "https://example.com/browser/devtools/client/debugger/test/mochitest/examples/";

// This URL is remote compared to EXAMPLE_URL, as one uses .com and the other uses .org
// Note that this depends on initDebugger to always use EXAMPLE_URL
const EXAMPLE_REMOTE_URL =
  "https://example.org/browser/devtools/client/debugger/test/mochitest/examples/";

const EXAMPLE_URL_WITH_PORT =
  "http://mochi.test:8888/browser/devtools/client/debugger/test/mochitest/examples/";

// shared-head.js handles imports, constants, and utility functions
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/shared/test/shared-head.js",
  this
);

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/debugger/test/mochitest/shared-head.js",
  this
);

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/webconsole/test/browser/shared-head.js",
  this
);

// Cleanup preferences set by the tracer.
registerCleanupFunction(() => {
  for (const pref of ["logging.console", "logging.PageMessages"]) {
    Services.prefs.clearUserPref(pref);
  }
});

/**
 * Install a Web Extension which will run a content script against any test page
 * served from https://example.com
 *
 * This content script is meant to be debuggable when devtools.chrome.enabled is true.
 */
async function installAndStartContentScriptExtension() {
  function contentScript() {
    console.log("content script loads");

    // This listener prevents the source from being garbage collected
    // and be missing from the scripts returned by `dbg.findScripts()`
    // in `ThreadActor._discoverSources`.
    window.onload = () => {};
  }

  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      name: "Test content script extension",
      content_scripts: [
        {
          js: ["content_script.js"],
          matches: ["https://example.com/*"],
          run_at: "document_start",
        },
      ],
    },
    files: {
      "content_script.js": contentScript,
    },
  });

  await extension.startup();

  return extension;
}

/**
 * Return the text content for a given line in the Source Tree.
 *
 * @param {object} dbg
 * @param {number} index
 *        Line number in the source tree
 */
function getSourceTreeLabel(dbg, index) {
  return (
    findElement(dbg, "sourceNode", index)
      .textContent.trim()
      // There is some special whitespace character which aren't removed by trim()
      .replace(/^[\s\u200b]*/g, "")
  );
}

/**
 * Find and assert the source tree node with the specified text
 * exists on the source tree.
 *
 * @param {object} dbg
 * @param {string} text The node text displayed
 */
async function assertSourceTreeNode(dbg, text) {
  let node = null;
  await waitUntil(() => {
    node = findSourceNodeWithText(dbg, text);
    return !!node;
  });
  ok(!!node, `Source tree node with text "${text}" exists`);
}

/**
 * Assert precisely the list of all breakable line for a given source
 *
 * @param {object} dbg
 * @param {object | string} file
 *        The source name or source object to review
 * @param {number} numberOfLines
 *        The expected number of lines for this source.
 * @param {Array<number>} breakableLines
 *        This list of all breakable line numbers
 */
async function assertBreakableLines(
  dbg,
  source,
  numberOfLines,
  breakableLines
) {
  await selectSource(dbg, source);
  is(
    getLineCount(dbg),
    numberOfLines,
    `We show the expected number of lines in CodeMirror for ${source}`
  );
  for (let line = 1; line <= numberOfLines; line++) {
    await assertLineIsBreakable(
      dbg,
      source,
      line,
      breakableLines.includes(line)
    );
  }
}

/**
 * Helper alongside assertBreakable lines to ease defining list of breakable lines.
 *
 * @param {number} start
 * @param {number} end
 * @return {Array<number>}
 *         Returns an array of decimal numbers starting from `start` and ending with `end`.
 */
function getRange(start, end) {
  const range = [];
  for (let i = start; i <= end; i++) {
    range.push(i);
  }
  return range;
}

/**
 * Get the currently selected line number displayed in the editor's footer.
 */
function assertCursorPosition(dbg, expectedLine, expectedColumn, message) {
  const cursorPosition = findElementWithSelector(dbg, ".cursor-position");
  if (!cursorPosition) {
    ok(false, message + " (no cursor displayed in footer)");
  }
  // Cursor position text has the following shape: (L, C)
  // where L is the line number, and C the column number
  const match = cursorPosition.innerText.match(/\((\d+), (\d+)\)/);
  if (!match) {
    ok(
      false,
      message +
        ` (wrong cursor content in footer : '${cursorPosition.innerText}')`
    );
  }
  const [_, line, column] = match;
  is(parseInt(line, 10), expectedLine, message + " (footer line)");
  is(parseInt(column, 10), expectedColumn, message + " (footer column)");
  const cursor = getCMEditor(dbg).getSelectionCursor();
  is(cursor.from.line, expectedLine, message + " (actual cursor line)");
  // CodeMirror column is 0-based while the location mentioned in test 1-based.
  is(cursor.from.ch + 1, expectedColumn, message + " (actual cursor column)");
}

/**
 * @see selectDebuggerContextMenuItem in debugger/test/mochitest/shared-head.js
 */
function selectContextMenuItem(dbg, selector) {
  return selectDebuggerContextMenuItem(dbg, selector);
}

function getEventListenersPanel(dbg) {
  return findElementWithSelector(dbg, ".event-listeners-pane .event-listeners");
}

/**
 * After reloading the page, wait for the breakpoint checkbox state to be
 * restored as checked.
 *
 * @param {object} dbg
 * @param {string} eventBreakpointGroup
 *        The name of the breakpoint's group, such as "Load"
 * @param {string} eventBreakpointName
 *        The name of the breakpoint, such as "event.load.unload"
 * @return {Promise} undefined
 */
async function waitForEventBreakpointChecked(
  dbg,
  eventBreakpointGroup,
  eventBreakpointName
) {
  const eventCheckbox = await getEventBreakpointCheckbox(
    dbg,
    eventBreakpointGroup,
    eventBreakpointName
  );

  info("Wait for the event breakpoint checkbox state to be restored");
  await waitFor(() => eventCheckbox.checked);
}

/**
 * Toggle the breakpoint checkbox.
 * If the page is reloaded immediately before this, the consumer should
 * call waitForEventBreakpointChecked to ensure that the breakpoint
 * state is fully restored.
 *
 * @param {object} dbg
 * @param {string} eventBreakpointGroup
 *        The name of the breakpoint's group, such as "Load"
 * @param {string} eventBreakpointName
 *        The name of the breakpoint, such as "event.load.unload"
 * @return {Promise} undefined
 */
async function toggleEventBreakpoint(
  dbg,
  eventBreakpointGroup,
  eventBreakpointName
) {
  const eventCheckbox = await getEventBreakpointCheckbox(
    dbg,
    eventBreakpointGroup,
    eventBreakpointName
  );
  eventCheckbox.scrollIntoView();
  info(`Toggle ${eventBreakpointName} breakpoint`);
  const onEventListenersUpdate = waitForDispatch(
    dbg.store,
    "UPDATE_EVENT_LISTENERS"
  );
  const checked = eventCheckbox.checked;
  eventCheckbox.click();
  await onEventListenersUpdate;

  info("Wait for the event breakpoint checkbox to be toggled");
  // Wait for he UI to be toggled, otherwise, the reducer may not be fully updated
  await waitFor(() => {
    return eventCheckbox.checked == !checked;
  });
}

/**
 * Get the breakpoint checkbox.
 *
 * @param {object} dbg
 * @param {string} eventBreakpointGroup
 *        The name of the breakpoint's group, such as "Load"
 * @param {string} eventBreakpointName
 *        The name of the breakpoint, such as "event.load.unload"
 * @return {Promise} checkbox element
 */
async function getEventBreakpointCheckbox(
  dbg,
  eventBreakpointGroup,
  eventBreakpointName
) {
  if (!getEventListenersPanel(dbg)) {
    // Event listeners panel is collapsed, expand it
    findElementWithSelector(
      dbg,
      `.event-listeners-pane ._header .header-label`
    ).click();
    await waitFor(() => getEventListenersPanel(dbg));
  }

  const groupCheckbox = findElementWithSelector(
    dbg,
    `input[value="${eventBreakpointGroup}"]`
  );
  const groupEl = groupCheckbox.closest(".event-listener-group");
  let groupEventsUl = groupEl.querySelector("ul");
  if (!groupEventsUl) {
    info(
      `Expand ${eventBreakpointGroup} and wait for the sub list to be displayed`
    );
    groupEl.querySelector(".event-listener-expand").click();
    groupEventsUl = await waitFor(() => groupEl.querySelector("ul"));
  }

  return findElementWithSelector(dbg, `input[value="${eventBreakpointName}"]`);
}

/**
 * Edits the stylesheet content within the editor
 *
 * @param {object} dbg
 * @param {number} cursorPosLine
 * @param {number} cursorPosColumn
 * @param {number} noOfCharactersToRemove
 * @param {string} textToType
 */
async function editSelectedSourceContent(
  dbg,
  cursorPosLine,
  cursorPosColumn,
  noOfCharactersToRemove,
  textToType
) {
  getCMEditor(dbg).focus();
  await setEditorCursorAt(dbg, cursorPosLine, cursorPosColumn);
  let x = noOfCharactersToRemove;
  while (x > 0) {
    pressKey(dbg, "Backspace");
    x--;
  }
  type(dbg, textToType);
}

/**
 * Toogle the visibility of the stylesheet by clicking the icon and assert
 * the background color changed.
 *
 * @param {object} dbg
 * @param {string} expectedPageColor
 */
async function toggleVisibilityAndAssertTheBackgroundPageColor(
  dbg,
  expectedPageColor
) {
  const bgColorChanged = waitForStylePropertyValueChange(
    dbg,
    "backgroundColor",
    expectedPageColor
  );

  info("Click to toggle the stylesheet");
  await toggleStylesheetsVisibility(dbg);
  await bgColorChanged;
  ok(true, "The body background color has changed");

  const currentBgColor =
    await getCurrentPageStylePropertyValue("backgroundColor");
  is(currentBgColor, expectedPageColor, "The background color is correct");
}

/**
 * Waits until the value of a specified style property on the page changes
 *
 * @param {object} dbg
 * @param {string} property
 * @param {string} expectedPropertyValue
 * @returns
 */
function waitForStylePropertyValueChange(dbg, property, expectedPropertyValue) {
  return waitFor(async () => {
    const currentPropertyValue =
      await getCurrentPageStylePropertyValue(property);
    return currentPropertyValue == expectedPropertyValue;
  });
}

/**
 * This gets the current value of the specified style property
 *
 * @returns
 */
function getCurrentPageStylePropertyValue(property) {
  return SpecialPowers.spawn(
    gBrowser.selectedBrowser,
    [property],
    function (styleProperty) {
      const bodyStyles = content.getComputedStyle(content.document.body);
      return bodyStyles[styleProperty];
    }
  );
}

/**
 * Toogle the visibility of the stylesheet by clicking the icon.
 * This should apply/unapply the stylesheet to the web page.
 *
 * @param {object} dbg
 * @returns
 */
async function toggleStylesheetsVisibility(dbg) {
  const el = findElementWithSelector(
    dbg,
    ".toggleStyleSheetVisibility .dbg-img-eye-opened"
  );
  const buttonUpdated = waitForElementWithSelector(
    dbg,
    `.toggleStyleSheetVisibility .dbg-img-eye-${el ? "closed" : "opened"}`
  );
  clickElement(dbg, "toggleStyleSheetVisibilityButton");
  return buttonUpdated;
}
