/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../../mochitest/role.js */
loadScripts({ name: "role.js", dir: MOCHITESTS_DIR });

/**
 * Verify a XUL acc with role=grid exposes table properties.
 */
addAccessibleTask(
  "tree/doc_xul_grid.xhtml",
  async function testXULGridProperties(browser, accDoc) {
    const gridAcc = findAccessibleChildByID(accDoc, "grid");
    is(gridAcc.role, ROLE_GRID, "XUL hbox with role=grid has grid role");

    const table = gridAcc.QueryInterface(Ci.nsIAccessibleTable);
    is(table.rowCount, 2, "Grid has two rows");
    is(table.columnCount, 3, "Grid has three columns");

    const cellAcc = table.getCellAt(1, 2);
    is(
      getAccessibleDOMNodeID(cellAcc),
      "cell12",
      "Correct cell at row 1, column 2"
    );
    is(cellAcc.role, ROLE_GRID_CELL, "Cell has grid cell role");

    const cell = cellAcc.QueryInterface(Ci.nsIAccessibleTableCell);
    is(cell.rowIndex, 1, "Cell has correct row index");
    is(cell.columnIndex, 2, "Cell has correct column index");
    is(cell.rowExtent, 1, "Cell spans one row");
    is(cell.columnExtent, 1, "Cell spans one column");
    is(cell.table, table, "Cell reports the grid as its table");
  },
  { topLevel: false, chrome: true }
);
