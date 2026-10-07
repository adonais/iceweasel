/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../../mochitest/role.js */
loadScripts({ name: "role.js", dir: MOCHITESTS_DIR });

addAccessibleTask(
  `<div>
      <a id="test-a">link</a>
    </div>`,
  async function testHTMLAnchorHrefRoleTransition(browser, accDoc) {
    const acc = findAccessibleChildByID(accDoc, "test-a");

    isRole(acc, ROLE_TEXT, "Initial role (no href)");

    let shown = waitForEvent(EVENT_SHOW, "test-a");
    await invokeContentTask(browser, [], () => {
      const el = content.document.getElementById("test-a");
      el.setAttribute("href", "#foo");
    });

    let shownAcc = (await shown).accessible;
    isRole(shownAcc, ROLE_LINK, "Role after adding href");

    let revertedShown = waitForEvent(EVENT_SHOW, "test-a");
    await invokeContentTask(browser, [], () => {
      const el = content.document.getElementById("test-a");
      el.removeAttribute("href");
    });

    let revertedAcc = (await revertedShown).accessible;
    isRole(revertedAcc, ROLE_TEXT, "Role after removing href");
  },
  {
    chrome: true,
    topLevel: true,
    iframe: true,
    remoteIframe: true,
  }
);

addAccessibleTask(
  `<div>
      <a id="test-a">link</a>
    </div>`,
  async function testHTMLAnchorClickListenerRoleTransition(browser, accDoc) {
    const acc = findAccessibleChildByID(accDoc, "test-a");

    isRole(acc, ROLE_TEXT, "Initial role (no click listener)");

    let shown = waitForEvent(EVENT_SHOW, "test-a");
    await invokeContentTask(browser, [], () => {
      const el = content.document.getElementById("test-a");
      content._testClickHandler = () => {};
      el.addEventListener("click", content._testClickHandler);
    });

    let shownAcc = (await shown).accessible;
    isRole(shownAcc, ROLE_LINK, "Role after adding click listener");

    let revertedShown = waitForEvent(EVENT_SHOW, "test-a");
    await invokeContentTask(browser, [], () => {
      const el = content.document.getElementById("test-a");
      if (content._testClickHandler) {
        el.removeEventListener("click", content._testClickHandler);
        delete content._testClickHandler;
      }
    });

    let revertedAcc = (await revertedShown).accessible;
    isRole(revertedAcc, ROLE_TEXT, "Role after removing click listener");
  },
  {
    chrome: true,
    topLevel: true,
    iframe: true,
    remoteIframe: true,
  }
);
