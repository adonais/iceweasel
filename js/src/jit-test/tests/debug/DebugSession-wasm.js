// |jit-test| skip-if: !wasmDebuggingEnabled()

// Debug sessions with Wasm frames on the stack.

load(libdir + "debug-session.js");

const g = newGlobal({newCompartment: true});
debugSessionCreate(g);
debugSessionCommand("enable");

// Instantiate after enabling the session, so that the module is compiled with
// debugging support.
g.evaluate(
  `var imports = {
  m: {
    hook(x) {
      debugger;
      return x + 1;
    },
  },
};
var text = \`(module
  (import "m" "hook" (func $hook (param i32) (result i32)))
  (func (export "f") (param i32) (result i32)
    (local $l i32)
    (local.set $l (i32.const 7))
    (call $hook (i32.add (local.get 0) (local.get $l)))))\`;
var inst = new WebAssembly.Instance(
  new WebAssembly.Module(wasmTextToBinary(text)),
  imports
);`,
  {fileName: "wasm-test.js", lineNumber: 1}
);

const wasmURL = debugSessionCommand("listScripts").find(url => url.startsWith("wasm:"));
assertEq(typeof wasmURL, "string");

debugSessionCommand("setPauseActions", [
  // At the debugger statement in hook: evaluate in hook and in the Wasm frame.
  {evaluate: "x"},
  {evaluate: "1 + 1", frame: 1},
  "stepOut", // Pause in the Wasm function when hook returns.
  "stepOver", // Go to the next Wasm instruction.
  "resume", // Run to completion.
]);
assertEq(g.inst.exports.f(3), 11);

let log = debugSessionCommand("takeLog");
const paused = pausedEntries(log);
assertEq(paused.length, 3);

// The debugger statement in the import, called from the Wasm function.
const [hookFrame, wasmFrame] = paused[0].callFrames;
assertEq(hookFrame.functionName, "hook");
assertEq(hookFrame.location.url, "wasm-test.js");
assertEq(hookFrame.location.line, 4);
assertEq(wasmFrame.location.url, wasmURL);
const wasmScope = wasmFrame.scopeChain[0];
assertEq(wasmScope.type, "wasm function");
assertEq(JSON.stringify(wasmScope.variables.var0), '{"type":"number","value":3}');
assertEq(JSON.stringify(wasmScope.variables.var1), '{"type":"number","value":7}');
assertEq(
  JSON.stringify(evaluateResults(log)),
  '[{"return":{"type":"number","value":10}},{"return":{"type":"number","value":2}}]'
);

// Stepping out of the import pauses in the Wasm frame, and stepping over moves
// forward in it. Wasm locations use bytecode offsets as line numbers.
assertEq(paused[1].url, wasmURL);
assertEq(paused[1].callFrames[0].location.url, wasmURL);
assertEq(paused[2].url, wasmURL);
assertEq(paused[2].line > paused[1].line, true);

// Breakpoints can be set by Wasm URL and bytecode offset. Stepping out paused
// at the call instruction, so a breakpoint there pauses before the call.
const offset = paused[1].line;
debugSessionCommand("setBreakpoints", [{id: "wasm", url: wasmURL, line: offset}]);
assertEq(g.inst.exports.f(3), 11);
log = debugSessionCommand("takeLog");
assertEq(
  JSON.stringify(pausedEntries(log).map(e => [e.url, e.line])),
  JSON.stringify([
    [wasmURL, offset],
    ["wasm-test.js", 4],
  ])
);
