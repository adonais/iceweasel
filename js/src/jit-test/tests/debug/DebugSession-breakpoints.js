// Breakpoints and stepping with the shell's debug sessions.

load(libdir + "asserts.js");
load(libdir + "debug-session.js");

const SOURCE = `function f(a) {
  let x = a + 1;
  let y = x * 2;
  let z = y - 3;
  return z;
}`;

// A breakpoint set before the script exists is applied from onNewScript.
{
  const g = newGlobal({newCompartment: true});
  debugSessionCreate(g);
  // The breakpoint pauses at line 3. Step over to lines 4 and 5, then resume.
  debugSessionCommand("setPauseActions", ["stepOver", "stepOver", "resume"]);
  debugSessionCommand("setBreakpoints", [{id: "bp1", url: "test.js", line: 3}]);
  debugSessionCommand("enable");
  g.evaluate(SOURCE, {fileName: "test.js", lineNumber: 1});
  assertEq(g.f(1), 1);

  const paused = pausedEntries(debugSessionCommand("takeLog"));
  assertEq(JSON.stringify(paused.map(e => e.line)), "[3,4,5]");
  assertEq(JSON.stringify(paused.map(e => e.action)), '["stepOver","stepOver","resume"]');
  assertEq(paused[0].url, "test.js");
  assertEq(paused[0].callFrames[0].functionName, "f");

  // At the breakpoint, x = a + 1 has run, but y is still uninitialized. At the
  // last pause z = y - 3 has run.
  const vars = paused[0].callFrames[0].scopeChain[0].variables;
  assertEq(JSON.stringify(vars.x), '{"type":"number","value":2}');
  assertEq(vars.y.type, "uninitialized");
  assertEq(paused[2].callFrames[0].scopeChain[0].variables.z.value, 1);
  // takeLog clears the log.
  assertEq(debugSessionCommand("takeLog").length, 0);
  debugSessionCommand("destroy");
}

// A breakpoint set on an existing script, then removed.
{
  const g = newGlobal({newCompartment: true});
  debugSessionCreate(g);
  debugSessionCommand("enable");
  g.evaluate(SOURCE, {fileName: "test.js", lineNumber: 1});
  debugSessionCommand("setBreakpoints", [{id: "bp1", url: "test.js", line: 4}]);
  g.f(1);
  assertEq(JSON.stringify(pausedEntries(debugSessionCommand("takeLog")).map(e => e.line)), "[4]");

  debugSessionCommand("setBreakpoints", []);
  g.f(1);
  assertEq(pausedEntries(debugSessionCommand("takeLog")).length, 0);
  debugSessionCommand("destroy");
}

// Multiple breakpoints.
{
  const g = newGlobal({newCompartment: true});
  debugSessionCreate(g);
  debugSessionCommand("enable");
  g.evaluate(SOURCE, {fileName: "test.js", lineNumber: 1});
  debugSessionCommand("setBreakpoints", [
    {id: "bp1", url: "test.js", line: 2},
    {id: "bp2", url: "test.js", line: 4},
  ]);
  g.f(1);
  assertEq(JSON.stringify(pausedEntries(debugSessionCommand("takeLog")).map(e => e.line)), "[2,4]");
  debugSessionCommand("destroy");
}

// Column breakpoints.
{
  const g = newGlobal({newCompartment: true});
  debugSessionCreate(g);
  debugSessionCommand("enable");
  g.evaluate("function h(a) { let b = a; return b + a; }", {
    fileName: "col.js",
    lineNumber: 1,
  });
  // Column 28 is the return statement.
  debugSessionCommand("setBreakpoints", [{id: "c", url: "col.js", line: 1, column: 28}]);
  g.h(2);
  const paused = pausedEntries(debugSessionCommand("takeLog"));
  assertEq(paused.length, 1);
  assertEq(paused[0].column, 28);
  debugSessionCommand("destroy");
}

// Invalid breakpoints are rejected.
{
  debugSessionCreate(newGlobal({newCompartment: true}));
  for (const bad of [
    "x", // Not a list.
    [null], // Not an object.
    [{id: {}, url: "a.js", line: 1}], // Bad id.
    [{id: 1, url: 2, line: 1}], // Bad url.
    [{id: 1, url: "a.js"}], // Missing line.
    [{id: 1, url: "a.js", line: 0}], // Line numbers start at 1.
    [{id: 1, url: "a.js", line: -1}], // Negative line.
    [{id: 1, url: "a.js", line: 1.5}], // Non-integer line.
    [{id: 1, url: "a.js", line: 1, column: 1.5}], // Non-integer column.
  ]) {
    assertThrowsInstanceOf(() => debugSessionCommand("setBreakpoints", bad), Error);
  }
  debugSessionCommand("destroy");
}
