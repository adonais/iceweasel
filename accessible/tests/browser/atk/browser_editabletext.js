/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

function getInputValue(browser) {
  return invokeContentTask(
    browser,
    [],
    () => content.document.getElementById("input").value
  );
}

/**
 * Test the AtkEditableText methods on a text input.
 */
addAccessibleTask(
  `<input id="input" value="abc">`,
  async function testEditableText(browser) {
    await runPython(`
      global input
      input = findByDomId(getDoc(), "input").queryEditableText()
    `);

    let changed = waitForEvent(EVENT_TEXT_VALUE_CHANGE, "input");
    await runPython(`input.setTextContents("hello")`);
    await changed;
    is(await getInputValue(browser), "hello", "setTextContents worked");

    changed = waitForEvent(EVENT_TEXT_VALUE_CHANGE, "input");
    await runPython(`input.insertText(5, " world", 6)`);
    await changed;
    is(await getInputValue(browser), "hello world", "insertText worked");

    changed = waitForEvent(EVENT_TEXT_VALUE_CHANGE, "input");
    await runPython(`input.deleteText(0, 6)`);
    await changed;
    is(await getInputValue(browser), "world", "deleteText worked");
  }
);
