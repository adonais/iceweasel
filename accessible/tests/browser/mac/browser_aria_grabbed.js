/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Test aria-grabbed on a button
addAccessibleTask(
  `<button aria-grabbed="" id="btn">Reorder me</button>`,
  async (browser, accDoc) => {
    const button = getNativeInterface(accDoc, "btn");

    is(
      button.getAttributeValue("AXGrabbed"),
      0,
      "AXGrabbed not initially exposed"
    );

    let attrChanged = waitForEvent(EVENT_OBJECT_ATTRIBUTE_CHANGED, "btn");
    await SpecialPowers.spawn(browser, [], () => {
      content.document
        .getElementById("btn")
        .setAttribute("aria-grabbed", "false");
    });
    await attrChanged;

    is(
      button.getAttributeValue("AXGrabbed"),
      0,
      "AXGrabbed not exposed when aria-grabbed set to 'false'"
    );

    attrChanged = waitForEvent(EVENT_OBJECT_ATTRIBUTE_CHANGED, "btn");
    await SpecialPowers.spawn(browser, [], () => {
      content.document
        .getElementById("btn")
        .setAttribute("aria-grabbed", "true");
    });
    await attrChanged;

    is(
      button.getAttributeValue("AXGrabbed"),
      1,
      "AXGrabbed exposed when aria-grabbed set to 'true'"
    );

    attrChanged = waitForEvent(EVENT_OBJECT_ATTRIBUTE_CHANGED, "btn");
    await SpecialPowers.spawn(browser, [], () => {
      content.document.getElementById("btn").removeAttribute("aria-grabbed");
    });
    await attrChanged;

    is(
      button.getAttributeValue("AXGrabbed"),
      0,
      "AXGrabbed not exposed when aria-grabbed attribute removed"
    );
  }
);
