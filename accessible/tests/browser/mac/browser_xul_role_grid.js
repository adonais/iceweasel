/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../../mochitest/role.js */
loadScripts({ name: "role.js", dir: MOCHITESTS_DIR });

/**
 * Verify that mutating a XUL element's role to `grid` causes the acc to be
 * recreated as an AXTable.
 */
addAccessibleTask(
  "mac/doc_xul_grid.xhtml",
  async function testXULGridMutation(browser, accDoc) {
    let acc = findAccessibleChildByID(accDoc, "button");
    is(acc.role, ROLE_PUSHBUTTON, "XUL button has push button role");
    is(
      acc.nativeInterface
        .QueryInterface(Ci.nsIAccessibleMacInterface)
        .getAttributeValue("AXRole"),
      "AXButton",
      "XUL button has AXButton role"
    );

    await invokeSetAttribute(browser, "button", "role", "grid");
    acc = await TestUtils.waitForCondition(() => {
      const newAcc = findAccessibleChildByID(accDoc, "button");
      return newAcc && newAcc.role == ROLE_GRID ? newAcc : false;
    }, "Waiting for the accessible to be recreated with a grid role");
    is(acc.role, ROLE_GRID, "XUL button with role=grid is a grid");
    is(
      acc.nativeInterface
        .QueryInterface(Ci.nsIAccessibleMacInterface)
        .getAttributeValue("AXRole"),
      "AXTable",
      "XUL button with role=grid has AXTable role"
    );
  },
  { topLevel: false, chrome: true }
);

/**
 * Verify a XUL grid exposes the correct set of table, cell properties.
 */
addAccessibleTask(
  "mac/doc_xul_grid.xhtml",
  async function testXULGridProperties(browser, accDoc) {
    const grid = getNativeInterface(accDoc, "grid");
    is(grid.getAttributeValue("AXRole"), "AXTable", "Grid has AXTable role");
    is(grid.getAttributeValue("AXRowCount"), 2, "Grid has two rows");
    is(grid.getAttributeValue("AXColumnCount"), 3, "Grid has three columns");
    is(grid.getAttributeValue("AXRows").length, 2, "Grid exposes two rows");
    is(
      grid.getAttributeValue("AXColumns").length,
      3,
      "Grid exposes three columns"
    );

    const cell = grid.getParameterizedAttributeValue(
      "AXCellForColumnAndRow",
      [2, 1]
    );
    is(
      cell.getAttributeValue("AXDOMIdentifier"),
      "cell12",
      "Correct cell at column 2, row 1"
    );
    is(cell.getAttributeValue("AXRole"), "AXCell", "Cell has AXCell role");
    Assert.deepEqual(
      cell.getAttributeValue("AXRowIndexRange"),
      [1, 1],
      "Cell has correct row range"
    );
    Assert.deepEqual(
      cell.getAttributeValue("AXColumnIndexRange"),
      [2, 1],
      "Cell has correct column range"
    );
  },
  { topLevel: false, chrome: true }
);
