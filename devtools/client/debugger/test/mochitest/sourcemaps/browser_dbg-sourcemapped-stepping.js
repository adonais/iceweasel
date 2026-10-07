/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

"use strict";

// Tests for stepping through Babel's compile output. Consecutive steps repeat a
// position where Babel's loop scaffolding maps several generated statements back
// to a single original one.
requestLongerTimeout(4);

// Original variable mapping is disabled, so no scope is ever displayed while
// paused in these original sources and there is nothing to wait for.
const PAUSE_OPTIONS = { shouldWaitForLoadedScopes: false };

add_task(async function () {
  const dbg = await initDebugger("doc-sourcemapped.html");

  await testStepOverForOf(dbg);
  await testStepOverForOfArray(dbg);
  await testStepOveForOfClosure(dbg);
  await testStepOverForOfArrayClosure(dbg);
  await testStepOverFunctionParams(dbg);
  await testStepOverRegeneratorAwait(dbg);
});

async function breakpointSteps(dbg, target, fixture, { line, column }, steps) {
  const filename = `${target}://./${fixture}/input.js`;
  const fnName = `${target}-${fixture}`.replace(/-([a-z])/g, (s, c) =>
    c.toUpperCase()
  );

  await invokeWithBreakpoint(
    dbg,
    fnName,
    filename,
    { line, column },
    async source => {
      await runSteps(dbg, source, steps);
    },
    PAUSE_OPTIONS
  );

  ok(true, `Ran tests for ${fixture} at line ${line} column ${column}`);
}

/**
 * @param {object} dbg
 * @param {object} source
 *        The original source the breakpoint was set in.
 * @param {Array} steps
 *        Array of [type, position] pairs, where position is the 1-based line and
 *        column the step is expected to pause at.
 */
async function runSteps(dbg, source, steps) {
  for (const [i, [type, position]] of steps.entries()) {
    info(`Step ${i}`);
    switch (type) {
      case "stepOver":
        await stepOver(dbg, PAUSE_OPTIONS);
        break;
      case "stepIn":
        await stepIn(dbg, PAUSE_OPTIONS);
        break;
      default:
        throw new Error("Unknown stepping type");
    }

    await assertPausedAtSourceAndLine(
      dbg,
      source.id,
      position.line,
      position.column
    );
  }
}

function testStepOverForOf(dbg) {
  return breakpointSteps(
    dbg,
    "webpack3-babel6",
    "step-over-for-of",
    { line: 4, column: 3 },
    [
      ["stepOver", { line: 3, column: 32 }],
      ["stepOver", { line: 3, column: 32 }],
      ["stepOver", { line: 3, column: 32 }],
      ["stepOver", { line: 6, column: 21 }],
      ["stepOver", { line: 6, column: 3 }],
      ["stepOver", { line: 6, column: 27 }],
      ["stepOver", { line: 7, column: 5 }],
    ]
  );
}

// This codifies the current behavior, but stepping twice over the for
// header isn't ideal.
function testStepOverForOfArray(dbg) {
  return breakpointSteps(
    dbg,
    "webpack3-babel6",
    "step-over-for-of-array",
    { line: 3, column: 3 },
    [
      ["stepOver", { line: 5, column: 21 }],
      ["stepOver", { line: 5, column: 3 }],
      ["stepOver", { line: 5, column: 3 }],
      ["stepOver", { line: 5, column: 14 }],
      ["stepOver", { line: 6, column: 5 }],
      ["stepOver", { line: 5, column: 3 }],
      ["stepOver", { line: 5, column: 3 }],
      ["stepOver", { line: 5, column: 14 }],
    ]
  );
}

// The closure means it isn't actually possible to step into the for body,
// and Babel doesn't map the _loop() call, so we step past it automatically.
function testStepOveForOfClosure(dbg) {
  return breakpointSteps(
    dbg,
    "webpack3-babel6",
    "step-over-for-of-closure",
    { line: 6, column: 3 },
    [
      ["stepOver", { line: 5, column: 32 }],
      ["stepOver", { line: 5, column: 32 }],
      ["stepOver", { line: 5, column: 32 }],
    ]
  );
}

// Same as the previous, not possible to step into the body. The less
// complicated array logic makes it possible to step into the header at least,
// but this does end up double-visiting the for head.
function testStepOverForOfArrayClosure(dbg) {
  return breakpointSteps(
    dbg,
    "webpack3-babel6",
    "step-over-for-of-array-closure",
    { line: 3, column: 3 },
    [
      ["stepOver", { line: 2, column: 32 }],
      ["stepOver", { line: 5, column: 21 }],
      ["stepOver", { line: 5, column: 3 }],
      ["stepOver", { line: 5, column: 3 }],
      ["stepOver", { line: 5, column: 14 }],
      ["stepOver", { line: 5, column: 29 }],
    ]
  );
}

function testStepOverFunctionParams(dbg) {
  return breakpointSteps(
    dbg,
    "webpack3-babel6",
    "step-over-function-params",
    { line: 6, column: 3 },
    [
      ["stepOver", { line: 7, column: 3 }],
      // Column 66 is the last character of line 1, the brace opening test()'s
      // body.
      ["stepIn", { line: 1, column: 66 }],
    ]
  );
}

function testStepOverRegeneratorAwait(dbg) {
  return breakpointSteps(
    dbg,
    "webpack3-babel6",
    "step-over-regenerator-await",
    { line: 2, column: 3 },
    [
      // Won't work until a fix to regenerator lands and we rebuild.
      // https://github.com/facebook/regenerator/issues/342
      // ["stepOver", { line: 4, column: 3 }],
    ]
  );
}
