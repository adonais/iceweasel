/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test implicit selected state.
 */
addAccessibleTask(
  `
<div role="tablist">
  <div id="noSel" role="tab" tabindex="0">noSel</div>
  <div id="noSel2" role="tab" tabindex="0">noSel2</div>
</div>
<div role="listbox" aria-multiselectable="true">
  <div id="multiNoSel" role="option" tabindex="0">multiNoSel</div>
</div>
<div role="grid">
  <div role="row">
    <div id="gridcell" role="gridcell" tabindex="0">gridcell</div>
  </div>
</div>
  `,
  async function (browser, docAcc) {
    const noSel = findAccessibleChildByID(docAcc, "noSel");
    testStates(noSel, 0, 0, STATE_FOCUSED | STATE_SELECTED, 0);
    info("Focusing noSel");
    let focused = waitForEvent(EVENT_FOCUS, noSel);
    noSel.takeFocus();
    await focused;
    testStates(noSel, STATE_FOCUSED | STATE_SELECTED, 0, 0, 0);

    const noSel2 = findAccessibleChildByID(docAcc, "noSel2");
    testStates(noSel2, 0, 0, STATE_FOCUSED | STATE_SELECTED, 0);
    info("Focusing noSel2");
    focused = waitForEvent(EVENT_FOCUS, noSel2);
    noSel2.takeFocus();
    await focused;
    testStates(noSel2, STATE_FOCUSED | STATE_SELECTED, 0, 0, 0);

    const multiNoSel = findAccessibleChildByID(docAcc, "multiNoSel");
    testStates(multiNoSel, 0, 0, STATE_FOCUSED | STATE_SELECTED, 0);
    info("Focusing multiNoSel");
    focused = waitForEvent(EVENT_FOCUS, multiNoSel);
    multiNoSel.takeFocus();
    await focused;
    testStates(multiNoSel, STATE_FOCUSED, 0, STATE_SELECTED, 0);

    const gridcell = findAccessibleChildByID(docAcc, "gridcell");
    testStates(gridcell, 0, 0, STATE_FOCUSED | STATE_SELECTED, 0);
    info("Focusing gridcell");
    focused = waitForEvent(EVENT_FOCUS, gridcell);
    gridcell.takeFocus();
    await focused;
    testStates(gridcell, STATE_FOCUSED, 0, STATE_SELECTED, 0);
  },
  { topLevel: true, iframe: true, remoteIframe: true, chrome: true }
);

// Ensure explicit selection gets priority over implicit selection
addAccessibleTask(
  `
  <div role="listbox" id="listbox">
    <div role="option" aria-selected="true" id="o1">a</div>
    <div role="option" tabindex="0" id="o2">b</div>
  </div>
  `,
  async function testExplicitSelection(browser, accDoc) {
    const o1 = findAccessibleChildByID(accDoc, "o1");
    const o2 = findAccessibleChildByID(accDoc, "o2");

    await untilCacheOk(() => {
      const [states] = getStates(o1);
      return (states & STATE_SELECTED) != 0;
    }, "option 1 should be selected");
    await untilCacheOk(() => {
      const [states] = getStates(o2);
      return (states & STATE_SELECTED) == 0;
    }, "option 2 should NOT be selected");

    // Focus the second option.
    const e = waitForEvents({
      expected: [[EVENT_FOCUS, "o2"]],
      unexpected: [[EVENT_SELECTION, "o2"]],
    });
    await invokeContentTask(browser, [], () => {
      content.document.getElementById("o2").focus();
    });
    await e;

    await untilCacheOk(() => {
      const [states] = getStates(o1);
      return (states & STATE_SELECTED) != 0;
    }, "option 1 should be selected");
    await untilCacheOk(() => {
      const [states] = getStates(o2);
      return (states & STATE_SELECTED) == 0 && (states & STATE_FOCUSED) != 0;
    }, "option 2 should NOT be selected but should be focused");
  },
  { chrome: true, iframe: true, remoteIframe: true }
);

/**
 * Verify that a gridcell isn't exposed as selectable unless aria-selected is
 * explicitly specified.
 */
addAccessibleTask(
  `
  <div role="grid">
    <div role="row">
      <div id="noAriaSelected" role="gridcell">a</div>
      <div id="ariaSelectedFalse" role="gridcell" aria-selected="false">b</div>
      <div id="ariaSelectedTrue" role="gridcell" aria-selected="true">c</div>
      <div id="mutGridcell" role="gridcell">d</div>
    </div>
  </div>
  <table role="grid">
    <tr>
      <td id="tdNoAriaSelected">a</td>
      <td id="tdAriaSelectedFalse" aria-selected="false">b</td>
      <td id="tdAriaSelectedTrue" aria-selected="true">c</td>
    </tr>
  </table>
  `,
  async function testGridcellSelectable(browser, docAcc) {
    const noAriaSelected = findAccessibleChildByID(docAcc, "noAriaSelected");
    testStates(noAriaSelected, 0, 0, STATE_SELECTABLE | STATE_SELECTED);

    const ariaSelectedFalse = findAccessibleChildByID(
      docAcc,
      "ariaSelectedFalse"
    );
    testStates(ariaSelectedFalse, STATE_SELECTABLE, 0, STATE_SELECTED);

    const ariaSelectedTrue = findAccessibleChildByID(
      docAcc,
      "ariaSelectedTrue"
    );
    testStates(ariaSelectedTrue, STATE_SELECTABLE | STATE_SELECTED);

    // These are implicit gridcells; i.e. <td> inside <table role="grid">.
    const tdNoAriaSelected = findAccessibleChildByID(
      docAcc,
      "tdNoAriaSelected"
    );
    testStates(tdNoAriaSelected, 0, 0, STATE_SELECTABLE | STATE_SELECTED);

    const tdAriaSelectedFalse = findAccessibleChildByID(
      docAcc,
      "tdAriaSelectedFalse"
    );
    testStates(tdAriaSelectedFalse, STATE_SELECTABLE, 0, STATE_SELECTED);

    const tdAriaSelectedTrue = findAccessibleChildByID(
      docAcc,
      "tdAriaSelectedTrue"
    );
    testStates(tdAriaSelectedTrue, STATE_SELECTABLE | STATE_SELECTED);

    // Verify that adding and removing aria-selected toggles the selectable
    // state accordingly.
    const mutGridcell = findAccessibleChildByID(docAcc, "mutGridcell");
    testStates(mutGridcell, 0, 0, STATE_SELECTABLE | STATE_SELECTED);

    info("Setting aria-selected=false on mutGridcell");
    let stateChanged = waitForStateChange(mutGridcell, STATE_SELECTABLE, true);
    await invokeSetAttribute(browser, "mutGridcell", "aria-selected", "false");
    await stateChanged;
    testStates(mutGridcell, STATE_SELECTABLE, 0, STATE_SELECTED);

    info("Setting aria-selected=undefined on mutGridcell");
    stateChanged = waitForStateChange(mutGridcell, STATE_SELECTABLE, false);
    await invokeSetAttribute(
      browser,
      "mutGridcell",
      "aria-selected",
      "undefined"
    );
    await stateChanged;
    testStates(mutGridcell, 0, 0, STATE_SELECTABLE | STATE_SELECTED);

    info("Setting aria-selected=false on mutGridcell (from undefined)");
    stateChanged = waitForStateChange(mutGridcell, STATE_SELECTABLE, true);
    await invokeSetAttribute(browser, "mutGridcell", "aria-selected", "false");
    await stateChanged;
    testStates(mutGridcell, STATE_SELECTABLE, 0, STATE_SELECTED);

    info("Removing aria-selected from mutGridcell");
    stateChanged = waitForStateChange(mutGridcell, STATE_SELECTABLE, false);
    await invokeSetAttribute(browser, "mutGridcell", "aria-selected");
    await stateChanged;
    testStates(mutGridcell, 0, 0, STATE_SELECTABLE | STATE_SELECTED);
  },
  { chrome: true, iframe: true, remoteIframe: true }
);
