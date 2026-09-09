/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * A focusable element that gets display:contents should become unfocusable.
 * The accessible should retain its SELECTABLE_TEXT state if its parent
 * frame is selectable.
 */
addAccessibleTask(
  `<a id="a" href="https://example.com">example</a>`,
  async function testBug(browser, docAcc) {
    const acc = findAccessibleChildByID(docAcc, "a");
    testStates(acc, STATE_FOCUSABLE, EXT_STATE_SELECTABLE_TEXT);

    let stateChanged = waitForStateChange("a", STATE_FOCUSABLE, false, false);
    await invokeContentTask(browser, [], () => {
      content.document.getElementById("a").style.display = "contents";
    });

    if (browser.isRemoteBrowser) {
      // XXX: In non-remote case we don't send a state change event because
      // we don't store the old style on LocalAccessible. This isn't critical.
      await stateChanged;
    }
    await testStates(
      findAccessibleChildByID(docAcc, "a"),
      0,
      EXT_STATE_SELECTABLE_TEXT,
      STATE_FOCUSABLE
    );

    stateChanged = waitForStateChange("a", STATE_FOCUSABLE, true, false);
    await invokeContentTask(browser, [], () => {
      content.document.getElementById("a").style.display = "inline";
    });

    await stateChanged;
    testStates(
      findAccessibleChildByID(docAcc, "a"),
      STATE_FOCUSABLE,
      EXT_STATE_SELECTABLE_TEXT
    );
  },
  { chrome: true, topLevel: true }
);
