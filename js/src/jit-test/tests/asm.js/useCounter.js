load(libdir + "asm.js");

// asm.js has been removed. Use counters for AsmJS and UseAsm have been removed
// from the codebase. This test now only verifies that Wasm counter is unaffected.

let useCounters = getUseCounterResults();

// No wasm is being used at this point
assertEq(useCounters.Wasm, 0);

// Do an imperative asm.js compilation (now runs as normal JS)
asmLink(asmCompile(
  USE_ASM +
  "function f(i) { i=i|0; return (i*2)|0 } return f"
));

// Do an imperative asm.js compilation that is invalid (now runs as normal JS)
Function.apply(null, [USE_ASM+"function f(){i=i|0} function g() { f(0) } return g"]);

// Define an asm.js function normally as part of this script (now runs as normal JS)
function valid() {
  "use asm";
  function f(i) { i=i|0; return (i*2)|0 } return f;
}
let f = valid();
assertEq(f(0), 0);
assertEq(f(1), 2);

useCounters = getUseCounterResults();

// Wasm counter should still be 0 (no wasm used)
assertEq(useCounters.Wasm, 0);

// Note: AsmJS and UseAsm counters have been removed from the implementation
