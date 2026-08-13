/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test AXIndexForChildUIElement
 */
addAccessibleTask(
  `<p id="p">Hello <a href="#" id="link">strange</a> world`,
  (browser, accDoc) => {
    let p = getNativeInterface(accDoc, "p");

    let children = p.getAttributeValue("AXChildren");
    is(children.length, 3, "p has 3 children");
    is(
      children[1].getAttributeValue("AXDOMIdentifier"),
      "link",
      "second child is link"
    );

    let index = p.getParameterizedAttributeValue(
      "AXIndexForChildUIElement",
      children[1]
    );
    is(index, 1, "link is second child");
  }
);

/**
 * Test textbox with more than one child
 */
addAccessibleTask(
  `<div id="textbox" role="textbox">Hello <a href="#">strange</a> world</div>`,
  (browser, accDoc) => {
    let textbox = getNativeInterface(accDoc, "textbox");

    is(
      textbox.getAttributeValue("AXChildren").length,
      3,
      "textbox has 3 children"
    );
  }
);

/**
 * Test textbox with one child
 */
addAccessibleTask(
  `<div id="textbox" role="textbox">Hello </div>`,
  async (browser, accDoc) => {
    let textbox = getNativeInterface(accDoc, "textbox");

    is(
      textbox.getAttributeValue("AXChildren").length,
      0,
      "textbox with one child is pruned"
    );

    let reorder = waitForEvent(EVENT_REORDER, "textbox");
    await SpecialPowers.spawn(browser, [], () => {
      let link = content.document.createElement("a");
      link.textContent = "World";
      content.document.getElementById("textbox").appendChild(link);
    });
    await reorder;

    is(
      textbox.getAttributeValue("AXChildren").length,
      2,
      "textbox with two child is not pruned"
    );
  }
);

/**
 * Verify AXChildrenInNavigationOrder exposes the same information
 * in the same order as AXChildren
 */
addAccessibleTask(
  `<a id="link" href="">Chat with a Specialist<span style="position:absolute;top:0;width:1px;height:1px;overflow:hidden;">(Opens in a new window)</span></a>`,
  (browser, accDoc) => {
    const link = getNativeInterface(accDoc, "link");
    const children = link.getAttributeValue("AXChildren");

    is(children.length, 2, "link has 2 children");
    is(
      children[0].getAttributeValue("AXRole"),
      "AXStaticText",
      "First child is a text node"
    );
    is(
      children[0].getAttributeValue("AXValue"),
      "Chat with a Specialist",
      "First child is the visible text"
    );
    is(
      children[1].getAttributeValue("AXRole"),
      "AXGroup",
      "Second child is the hidden group"
    );

    const navOrderChildren = link.getAttributeValue(
      "AXChildrenInNavigationOrder"
    );

    is(
      navOrderChildren.length,
      2,
      "AXChildrenInNavigationOrder has 2 children"
    );
    is(
      navOrderChildren[0].getAttributeValue("AXRole"),
      "AXStaticText",
      "First child in navigation order is a text node"
    );
    is(
      navOrderChildren[0].getAttributeValue("AXValue"),
      "Chat with a Specialist",
      "Visible text comes first in navigation order"
    );
    is(
      navOrderChildren[1].getAttributeValue("AXRole"),
      "AXGroup",
      "Hidden group comes second in navigation order"
    );
  }
);
