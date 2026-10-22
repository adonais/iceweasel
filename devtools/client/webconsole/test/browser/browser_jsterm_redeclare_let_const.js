/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

"use strict";

// Check that let/const can be redeclared across successive console
// evaluations in the global lexical environment.

const TEST_URI = "data:text/html;charset=utf-8,<!DOCTYPE html>";

add_task(async function () {
  const hud = await openNewTabAndConsole(TEST_URI);

  info("Redeclare let/const in regular console evaluation");
  await executeAndWaitForResultMessage(hud, "let x = 1; x;", "1");
  await executeAndWaitForResultMessage(hud, "let x = 2; x;", "2");
  await executeAndWaitForResultMessage(hud, "const c = 1; c;", "1");
  await executeAndWaitForResultMessage(hud, "const c = 2; c;", "2");

  info("Same-input duplicates are still parser errors");
  await executeAndWaitForErrorMessage(
    hud,
    "let x = 4; let x = 5;",
    "redeclaration of let x"
  );
});
