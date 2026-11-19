// |jit-test| --fuzzing-safe

// With --fuzzing-safe, the Debugger API is only available through debug
// sessions.

load(libdir + "debug-session.js");

assertEq(typeof Debugger, "undefined");
const g = newGlobal({newCompartment: true});
assertEq(typeof g.Debugger, "undefined");

debugSessionCreate(g);
debugSessionCommand("setPauseActions", [
  // At the debugger statement: the debuggee doesn't have Debugger either.
  {evaluate: "typeof Debugger"},
  "stepOver", // Go to the next line.
  "resume", // Run to completion.
]);
debugSessionCommand("enable");
g.evaluate(`function f() {
  debugger;
  return 1;
}`, {fileName: "fs.js", lineNumber: 1});
assertEq(g.f(), 1);

// Debug sessions work: they pause at the debugger statement and step to the
// next line.
const log = debugSessionCommand("takeLog");
assertEq(JSON.stringify(pausedEntries(log).map(e => e.line)), "[2,3]");
assertEq(
  JSON.stringify(evaluateResults(log)),
  '[{"return":{"type":"string","value":"undefined"}}]'
);
