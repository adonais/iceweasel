/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test aria-keyshortcuts, with Meta and Alt exposed as Command and Option.
 */
addAccessibleTask(
  `
  <div id="btn" role="button" aria-keyshortcuts="Alt+Shift+f">bar</div>
  <div id="meta" role="button" aria-keyshortcuts="Meta+Shift+M">a</div>
  <div id="control" role="button" aria-keyshortcuts="Control+Shift+X">b</div>
  <div id="altGraph" role="button" aria-keyshortcuts="AltGraph+Q">c</div>
  <div id="multiple" role="button" aria-keyshortcuts="meta+k ALT+P">d</div>
  <div id="hyphen" role="button" aria-keyshortcuts="Alt-Q">e</div>
  <div id="emptyKey" role="button" aria-keyshortcuts="Meta++Q">f</div>
  <div id="prefix" role="button" aria-keyshortcuts="Metadata+Alternate+Q">g</div>
  <div id="whitespace" role="button" aria-keyshortcuts=" Meta+Q ">h</div>  `,
  async (browser, accDoc) => {
    is(
      getNativeInterface(accDoc, "btn").getAttributeValue(
        "AXKeyShortcutsValue"
      ),
      "Option+Shift+f",
      "aria-keyshortcuts value is correct for #btn"
    );
    is(
      getNativeInterface(accDoc, "meta").getAttributeValue(
        "AXKeyShortcutsValue"
      ),
      "Command+Shift+M",
      "aria-keyshortcuts value is correct for #meta"
    );
    is(
      getNativeInterface(accDoc, "control").getAttributeValue(
        "AXKeyShortcutsValue"
      ),
      "Control+Shift+X",
      "aria-keyshortcuts value is correct for #control"
    );
    is(
      getNativeInterface(accDoc, "altGraph").getAttributeValue(
        "AXKeyShortcutsValue"
      ),
      "AltGraph+Q",
      "aria-keyshortcuts value is correct for #altGraph"
    );
    is(
      getNativeInterface(accDoc, "multiple").getAttributeValue(
        "AXKeyShortcutsValue"
      ),
      "Command+k Option+P",
      "aria-keyshortcuts value is correct for #multiple"
    );
    is(
      getNativeInterface(accDoc, "hyphen").getAttributeValue(
        "AXKeyShortcutsValue"
      ),
      "Alt-Q",
      "aria-keyshortcuts value is correct for #hyphen"
    );
    is(
      getNativeInterface(accDoc, "emptyKey").getAttributeValue(
        "AXKeyShortcutsValue"
      ),
      "Command++Q",
      "aria-keyshortcuts value is correct for #emptyKey"
    );
    is(
      getNativeInterface(accDoc, "prefix").getAttributeValue(
        "AXKeyShortcutsValue"
      ),
      "Metadata+Alternate+Q",
      "aria-keyshortcuts value is correct for #prefix"
    );
    is(
      getNativeInterface(accDoc, "whitespace").getAttributeValue(
        "AXKeyShortcutsValue"
      ),
      " Command+Q ",
      "aria-keyshortcuts value is correct for #whitespace"
    );

    // Ensure a mutation results in the appropriately exposed shortcut
    const attrChanged = waitForEvent(EVENT_OBJECT_ATTRIBUTE_CHANGED, "btn");
    await invokeSetAttribute(
      browser,
      "btn",
      "aria-keyshortcuts",
      "Meta+K\nAlt+P"
    );
    await attrChanged;
    is(
      getNativeInterface(accDoc, "btn").getAttributeValue(
        "AXKeyShortcutsValue"
      ),
      "Command+K\nOption+P",
      "aria-keyshortcuts value is correct after change"
    );
  }
);
