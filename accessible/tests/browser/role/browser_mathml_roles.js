/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../../mochitest/role.js */
loadScripts({ name: "role.js", dir: MOCHITESTS_DIR });

addAccessibleTask(
  "doc_mathml.html",
  async function testMathMLRoles(browser, accDoc) {
    const getAcc = id => findAccessibleChildByID(accDoc, id);

    const crossPlatformExpectations = [
      ["a-href", ROLE_MATHML_LINK],
      ["a-row", ROLE_MATHML_ROW],
      ["a-onclick", ROLE_MATHML_LINK],
      ["ms", ROLE_MATHML_TEXT],
      ["mpadded", ROLE_MATHML_ROW],
      ["mphantom", ROLE_MATHML_ROW],
      ["mmultiscripts", ROLE_MATHML_MULTISCRIPTS],
      ["none", ROLE_MATHML_EMPTY_GROUP],
      ["mprescripts", ROLE_MATHML_EMPTY_GROUP],
      ["mspace", ROLE_MATHML_EMPTY_GROUP],
      ["semantics", ROLE_MATHML_ROW],
      ["annotation", ROLE_MATHML_TEXT],
      ["annotation-xml", ROLE_MATHML_ROW],
      ["maction", ROLE_MATHML_ROW],
    ];

    for (const [id, expectedRole] of crossPlatformExpectations) {
      testRole(getAcc(id), expectedRole);
    }
  },
  {
    chrome: true,
    topLevel: true,
    iframe: true,
    remoteIframe: true,
  }
);

addAccessibleTask(
  `<math xmlns="http://www.w3.org/1998/Math/MathML">
     <a id="test-a"><mi>x</mi></a>
   </math>`,
  async function testMathMLAnchorHrefRoleTransition(browser, accDoc) {
    const acc = findAccessibleChildByID(accDoc, "test-a");

    isRole(acc, ROLE_MATHML_ROW, "Initial role (no href)");

    let shown = waitForEvent(EVENT_SHOW, "test-a");

    await invokeContentTask(browser, [], () => {
      const el = content.document.getElementById("test-a");
      el.setAttribute("href", "#foo");
    });

    let shownAcc = (await shown).accessible;
    isRole(shownAcc, ROLE_MATHML_LINK, "Role after adding href");

    let revertedShown = waitForEvent(EVENT_SHOW, "test-a");

    await invokeContentTask(browser, [], () => {
      const el = content.document.getElementById("test-a");
      el.removeAttribute("href");
    });

    let revertedAcc = (await revertedShown).accessible;
    isRole(revertedAcc, ROLE_MATHML_ROW, "Role after removing href");
  },
  {
    chrome: true,
    topLevel: true,
    iframe: true,
    remoteIframe: true,
  }
);

addAccessibleTask(
  `<math xmlns="http://www.w3.org/1998/Math/MathML">
     <a id="test-a"><mi>x</mi></a>
   </math>`,
  async function testMathMLAnchorClickListenerRoleTransition(browser, accDoc) {
    const acc = findAccessibleChildByID(accDoc, "test-a");

    isRole(acc, ROLE_MATHML_ROW, "Initial role (no click listener)");

    let shown = waitForEvent(EVENT_SHOW, "test-a");
    await invokeContentTask(browser, [], () => {
      const el = content.document.getElementById("test-a");
      content._testClickHandler = () => {};
      el.addEventListener("click", content._testClickHandler);
    });

    let shownAcc = (await shown).accessible;
    isRole(shownAcc, ROLE_MATHML_LINK, "Role after adding click listener");

    let revertedShown = waitForEvent(EVENT_SHOW, "test-a");
    await invokeContentTask(browser, [], () => {
      const el = content.document.getElementById("test-a");
      if (content._testClickHandler) {
        el.removeEventListener("click", content._testClickHandler);
        delete content._testClickHandler;
      }
    });

    let revertedAcc = (await revertedShown).accessible;
    isRole(revertedAcc, ROLE_MATHML_ROW, "Role after removing click listener");
  },
  {
    chrome: true,
    topLevel: true,
    iframe: true,
    remoteIframe: true,
  }
);
