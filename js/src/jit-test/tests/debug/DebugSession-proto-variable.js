// A scope variable named __proto__ is reported like any other variable.

load(libdir + "debug-session.js");

const g = newGlobal({newCompartment: true});
g.evaluate(
  `function f(__proto__, other) {
  debugger;
}`,
  {fileName: "proto.js", lineNumber: 1}
);

debugSessionCreate(g);
debugSessionCommand("enable");
g.f(1, 2);

const vars = pausedEntries(debugSessionCommand("takeLog"))[0].callFrames[0].scopeChain[0].variables;
assertEq(Object.hasOwn(vars, "__proto__"), true);
assertEq(JSON.stringify(vars.__proto__), '{"type":"number","value":1}');
assertEq(JSON.stringify(vars.other), '{"type":"number","value":2}');
