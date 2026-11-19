// Script listing, sources and enable/disable of a debug session.

load(libdir + "asserts.js");
load(libdir + "debug-session.js");

// Scripts that aren't referenced anymore can be collected before they're
// listed.
gczeal(0);

const g = newGlobal({newCompartment: true});
debugSessionCreate(g);

// Commands needing a Debugger fail before enable.
assertThrowsInstanceOfWithMessageContains(
  () => debugSessionCommand("listScripts"),
  Error,
  "not-enabled"
);

debugSessionCommand("enable");
g.evaluate("function a() { debugger; }", {fileName: "a.js"});
g.evaluate("var b = 1;", {fileName: "b.js"});
const scripts = debugSessionCommand("listScripts");
assertEq(scripts.includes("a.js"), true);
assertEq(scripts.includes("b.js"), true);
assertEq(debugSessionCommand("getScriptSource", "b.js"), "var b = 1;");
assertThrowsInstanceOfWithMessageContains(
  () => debugSessionCommand("getScriptSource", "nope.js"),
  Error,
  "invalid-argument"
);

// a's debugger statement pauses.
g.a();
assertEq(pausedEntries(debugSessionCommand("takeLog")).length, 1);

// After disable the debugger statement no longer pauses.
debugSessionCommand("disable");
g.a();
assertEq(pausedEntries(debugSessionCommand("takeLog")).length, 0);

// Re-enabling works.
debugSessionCommand("enable");
g.a();
assertEq(pausedEntries(debugSessionCommand("takeLog")).length, 1);

// There can only be one session at a time.
assertThrowsInstanceOfWithMessageContains(
  () => debugSessionCreate(newGlobal({newCompartment: true})),
  Error,
  "a debug session already exists"
);

// After destroy, commands fail until a new session is created.
debugSessionCommand("destroy");
assertThrowsInstanceOfWithMessageContains(
  () => debugSessionCommand("enable"),
  Error,
  "no debug session"
);

debugSessionCreate(g);
assertThrowsInstanceOfWithMessageContains(
  () => debugSessionCommand("bogus"),
  Error,
  "unknown command"
);
assertThrowsInstanceOfWithMessageContains(
  () => debugSessionCommand(1),
  Error,
  "expected a command"
);
debugSessionCommand("destroy");

// Globals that are invisible to debuggers can't be debugged.
debugSessionCreate(newGlobal({newCompartment: true, invisibleToDebugger: true}));
assertThrowsInstanceOfWithMessageContains(
  () => debugSessionCommand("enable"),
  Error,
  "can't debug this global"
);
debugSessionCommand("destroy");
