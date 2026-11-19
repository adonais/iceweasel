// Pausing on exceptions with the shell's debug sessions.

load(libdir + "asserts.js");
load(libdir + "debug-session.js");

const g = newGlobal({newCompartment: true});
g.evaluate(
  `function thrower(v) {
  throw v;
}
function middle(v) {
  return thrower(v);
}
function caught() {
  try {
    middle(1);
  } catch (e) {
    return "caught";
  }
}
function rethrown() {
  try {
    middle(2);
  } catch (e) {
    throw e;
  }
}
function uncaught() {
  middle(new TypeError("oops"));
}`,
  {fileName: "ex.js", lineNumber: 1}
);

function run(f) {
  try {
    return f();
  } catch (e) {
    return "threw";
  }
}

debugSessionCreate(g);
debugSessionCommand("enable");

// Return the pauses in |log| as "function:line" strings, with a "!" for pauses
// with an exception.
function pauses(log) {
  return pausedEntries(log)
    .map(e => `${e.callFrames[0].functionName}:${e.line}${e.exception ? "!" : ""}`)
    .join(" ");
}

// Nothing pauses by default.
assertEq(run(g.uncaught), "threw");
assertEq(pauses(debugSessionCommand("takeLog")), "");

// "all" pauses in every frame the exception unwinds through.
debugSessionCommand("setPauseOnExceptions", "all");
assertEq(run(g.caught), "caught");
let log = debugSessionCommand("takeLog");
assertEq(JSON.stringify(pausedEntries(log)[0].exception), '{"type":"number","value":1}');
assertEq(run(g.caught), "caught");
assertEq(pauses(debugSessionCommand("takeLog")), "thrower:2! middle:5! caught:9!");

// Rethrowing pauses again where the exception is rethrown.
assertEq(run(g.rethrown), "threw");
assertEq(pauses(debugSessionCommand("takeLog")), "thrower:2! middle:5! rethrown:16! rethrown:18!");

// "uncaught" skips exceptions caught by a debuggee frame.
debugSessionCommand("setPauseOnExceptions", "uncaught");
assertEq(run(g.caught), "caught");
assertEq(pauses(debugSessionCommand("takeLog")), "");
assertEq(run(g.uncaught), "threw");
log = debugSessionCommand("takeLog");
assertEq(
  JSON.stringify(pausedEntries(log)[0].exception),
  '{"type":"object","class":"TypeError"}'
);
assertEq(pausedEntries(log).length, 3);

// Evaluations and steps work at exception pauses, and exceptions thrown by
// evaluated code don't pause.
debugSessionCommand("setPauseOnExceptions", "all");
debugSessionCommand("setPauseActions", [
  {evaluate: "v"},
  {evaluate: "thrower(3)"},
  "stepOver",
]);
assertEq(run(g.caught), "caught");
log = debugSessionCommand("takeLog");
assertEq(
  JSON.stringify(evaluateResults(log)),
  '[{"return":{"type":"number","value":1}},{"throw":{"type":"number","value":3}}]'
);
assertEq(pausedEntries(log)[0].action, "stepOver");
// The step pauses in middle before the exception unwinds through it.
assertEq(pauses(log), "thrower:2! middle:5 middle:5! caught:9!");

// "none" turns it off again; invalid modes are rejected.
debugSessionCommand("setPauseOnExceptions", "none");
assertEq(run(g.uncaught), "threw");
assertEq(pauses(debugSessionCommand("takeLog")), "");
assertThrowsInstanceOfWithMessageContains(
  () => debugSessionCommand("setPauseOnExceptions", "sometimes"),
  Error,
  "invalid-argument"
);

// The mode is kept across disable and enable.
debugSessionCommand("setPauseOnExceptions", "all");
debugSessionCommand("disable");
assertEq(run(g.caught), "caught");
debugSessionCommand("enable");
assertEq(run(g.caught), "caught");
assertEq(pauses(debugSessionCommand("takeLog")), "thrower:2! middle:5! caught:9!");

// Exceptions that are objects are reported with their class.
g.evaluate(
  `function throwsErrors() {
  try {
    throw new Error("first");
  } catch {}
  try {
    throw new RangeError("second");
  } catch {}
}`,
  {fileName: "errors.js", lineNumber: 1}
);
run(g.throwsErrors);
assertEq(
  JSON.stringify(pausedEntries(debugSessionCommand("takeLog")).map(e => e.exception)),
  JSON.stringify([
    {type: "object", class: "Error"},
    {type: "object", class: "RangeError"},
  ])
);
