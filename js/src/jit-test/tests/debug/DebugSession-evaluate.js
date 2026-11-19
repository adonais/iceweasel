// Evaluating code in the paused frames of a debug session.

load(libdir + "asserts.js");
load(libdir + "debug-session.js");

const g = newGlobal({newCompartment: true});
g.evaluate(
  `function f(n) {
  let local = n * 2;
  debugger;
  return local;
}
function caller() {
  let outerLocal = "outer";
  return f(21);
}`,
  {fileName: "ev.js", lineNumber: 1}
);

// All actions run at the pause at f's debugger statement. Frame 0, the default,
// is f and frame 1 is caller.
debugSessionCreate(g);
debugSessionCommand("setPauseActions", [
  {evaluate: "local + 1"},
  {evaluate: "outerLocal", frame: 1},
  // Exceptions are reported as {throw}.
  {evaluate: "throw new TypeError('boom')"},
  // Assignments change the frame's variables, so f returns 100.
  {evaluate: "local = 100"},
  // Frames that don't exist are reported as {error}.
  {evaluate: "1", frame: 99},
  // Debuggee code can't use commands while paused, or create another session.
  {evaluate: `debugSessionCommand("disable")`},
  {evaluate: `debugSessionCreate(this)`},
  "resume",
]);
debugSessionCommand("enable");
assertEq(g.caller(), 100);

const log = debugSessionCommand("takeLog");
assertEq(JSON.stringify(log.map(e => e.type)), JSON.stringify([
  "paused", "evaluate", "evaluate", "evaluate", "evaluate", "evaluate",
  "evaluate", "evaluate", "resumed",
]));
assertEq(pausedEntries(log)[0].action, "resume");
const results = evaluateResults(log).map(r => JSON.stringify(r));
assertEq(results[0], '{"return":{"type":"number","value":43}}');
assertEq(results[1], '{"return":{"type":"string","value":"outer"}}');
assertEq(results[2], '{"throw":{"type":"object","class":"TypeError"}}');
assertEq(results[3], '{"return":{"type":"number","value":100}}');
assertEq(results[4], '{"error":"no frame with index 99"}');
assertEq(results[5], '{"throw":{"type":"object","class":"Error"}}');
assertEq(results[6], '{"throw":{"type":"object","class":"Error"}}');
debugSessionCommand("destroy");

// Actions are consumed across pauses, and nested pauses take the next ones.
{
  debugSessionCreate(g);
  debugSessionCommand("setPauseActions", [
    // Calling f pauses again at its debugger statement, nested in this pause.
    {evaluate: "f(1)"},
    "resume", // Ends the nested pause.
    "resume", // Ends the outer pause.
  ]);
  debugSessionCommand("enable");
  g.f(5);
  const log2 = debugSessionCommand("takeLog");
  assertEq(JSON.stringify(log2.map(e => e.type)), JSON.stringify([
    "paused", "evaluate", "paused", "resumed", "resumed",
  ]));
  assertEq(JSON.stringify(evaluateResults(log2)[0]), '{"return":{"type":"number","value":2}}');
  debugSessionCommand("destroy");
}

// Actions after a step run at the next pause.
{
  debugSessionCreate(g);
  debugSessionCommand("setPauseActions", [
    {evaluate: "local + 1"},
    "stepOut",
    {evaluate: "outerLocal"},
    "resume",
  ]);
  debugSessionCommand("enable");
  assertEq(g.caller(), 42);
  const log3 = debugSessionCommand("takeLog");
  assertEq(JSON.stringify(log3.map(e => e.type)), JSON.stringify([
    "paused", "evaluate", "resumed", "paused", "evaluate", "resumed",
  ]));
  const paused3 = pausedEntries(log3);
  assertEq(paused3.map(e => e.callFrames[0].functionName).join(), "f,caller");
  assertEq(paused3.map(e => e.action).join(), "stepOut,resume");
  assertEq(JSON.stringify(evaluateResults(log3)), JSON.stringify([
    {return: {type: "number", value: 43}},
    {return: {type: "string", value: "outer"}},
  ]));
  debugSessionCommand("destroy");
}

// Invalid actions are rejected.
for (const bad of [
  "stepOver", // Not a list.
  ["bogus"], // Unknown action.
  [null], // Not an object.
  [{}], // No expression.
  [{evaluate: 1}], // The expression isn't a string.
  [{evaluate: "1", frame: -1}], // Negative frame index.
  [{evaluate: "1", frame: 0.5}], // Non-integer frame index.
]) {
  debugSessionCreate(g);
  assertThrowsInstanceOf(() => debugSessionCommand("setPauseActions", bad), Error);
  debugSessionCommand("destroy");
}

// Errors are created in the caller's realm.
assertThrowsInstanceOfWithMessageContains(
  () => debugSessionCommand("enable"),
  Error,
  "no debug session"
);

// Getters on arguments run in the caller before entering the host.
{
  debugSessionCreate(g);
  let calls = 0;
  const bp = {
    get id() {
      calls++;
      return "x";
    },
    url: "ev.js",
    line: 4,
  };
  debugSessionCommand("setBreakpoints", [bp]);
  assertEq(calls, 1);
  debugSessionCommand("enable");
  g.f(1);
  assertEq(pausedEntries(debugSessionCommand("takeLog")).map(e => e.line).join(), "3,4");
  debugSessionCommand("destroy");
}

// The caller's own global can be the debuggee.
{
  debugSessionCreate(this);
  debugSessionCommand("enable");
  (function () {
    debugger;
  })();
  assertEq(pausedEntries(debugSessionCommand("takeLog")).length, 1);
  debugSessionCommand("destroy");
}

// Non-global debuggees are rejected.
assertThrowsInstanceOfWithMessageContains(
  () => debugSessionCreate({}),
  Error,
  "expected a global"
);
assertThrowsInstanceOfWithMessageContains(
  () => debugSessionCreate(),
  Error,
  "At least 1 argument"
);
