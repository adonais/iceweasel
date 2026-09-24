/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test the IsWebContentRoot property in content documents. This should be true
 * for a tab document, but false for a document in an iframe (including a remote
 * iframe) and false for a node inside a document.
 */
addAccessibleTask(
  `<p id="p">test</p>`,
  async function testIsWebContentRootContent(browser, docAcc, topDocAcc) {
    await definePyVar("doc", `getDocUia()`);
    is(
      await runPython(
        `bool(doc.GetCurrentPropertyValue(uiaIsWebContentRootPropertyId))`
      ),
      // topDocAcc is only set for iframe and remoteIframe tests, in which case
      // getDocUia() is the iframe's document, not the tab document.
      !topDocAcc,
      "doc has correct IsWebContentRoot"
    );
    await assignPyVarToUiaWithId("p");
    ok(
      !(await runPython(
        `bool(p.GetCurrentPropertyValue(uiaIsWebContentRootPropertyId))`
      )),
      "p IsWebContentRoot is false"
    );
  },
  { topLevel: true, iframe: true, remoteIframe: true }
);

/**
 * Test that the browser UI (the top level chrome window) doesn't have
 * IsWebContentRoot. We can't use getDocUia() for this because it always
 * returns the content document.
 */
addAccessibleTask(``, async function testIsWebContentRootBrowserUi() {
  ok(
    !(await runPython(`
      hwnd = getFirefoxHwnd()
      root = uiaClient.ElementFromHandle(hwnd)
      return bool(root.GetCurrentPropertyValue(uiaIsWebContentRootPropertyId))
    `)),
    "Browser UI IsWebContentRoot is false"
  );
});
