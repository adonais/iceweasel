// Stepping into and out of calls with the shell's debug sessions.

load(libdir + "debug-session.js");

const g = newGlobal({newCompartment: true});
debugSessionCreate(g);
debugSessionCommand("setPauseActions", [
  "stepOver", // At the debugger statement: go to the next line.
  "stepInto", // At the call: pause in inner.
  "stepOut", // In inner: pause in outer when inner returns.
  "stepOver", // Back at the call line: go to the next line.
  "resume", // Run to completion.
]);
debugSessionCommand("enable");
g.evaluate(
  `function inner(v) {
  return v * 10;
}
function outer() {
  debugger;
  let r = inner(4);
  return r + 1;
}`,
  {fileName: "step.js", lineNumber: 1}
);
assertEq(g.outer(), 41);

const log = debugSessionCommand("takeLog");
const paused = pausedEntries(log);
const trace = paused.map(e => e.callFrames[0].functionName + ":" + e.line);
assertEq(
  JSON.stringify(trace),
  JSON.stringify(["outer:5", "outer:6", "inner:2", "outer:6", "outer:7"])
);
// When paused in inner, the frames are inner and outer. outer is called from
// this test's global, which isn't a debuggee, so there are no other frames.
assertEq(paused[2].callFrames.length, 2);
assertEq(paused[2].callFrames[1].functionName, "outer");
