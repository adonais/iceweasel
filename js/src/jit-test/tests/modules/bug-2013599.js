// |jit-test| error: InternalError

// Test unexpected module status during evaluation throws rather than
// asserts. This situation is only possbile with the use of the shell testing
// functions registerModule and moduleEvaluate.

// Module B: Part of cycle with A. During execution, re-entrantly evaluates C.
var bSrc = `
import {} from "a";

// Now trigger re-entrant evaluation of a separate module graph.
// Note this is not possible without use of shell testing functions.
moduleEvaluate(globalThis._cw);

export var bVal = 1;
`;

// Module A: Forms cycle with B
var aSrc = `
import {} from "b";
export var aVal = 2;
`;

// Module C: Imports B. When evaluated re-entrantly during B's execution,
// B is in "Evaluating" status from A's context but NOT in C's stack.
// This violates the invariant at Modules.cpp:2073.
var cSrc = `
import {} from "b";
export var cVal = 3;
`;

// Setup: parse, register, and link all modules
var bMod = parseModule(bSrc, "b.js");
registerModule("b", bMod);

var aMod = parseModule(aSrc, "a.js");
registerModule("a", aMod);

var cMod = parseModule(cSrc, "c.js");
globalThis._cw = registerModule("c", cMod);

// Link modules (all must be linked before evaluation)
moduleLink(aMod);
moduleLink(cMod);

// Trigger: Evaluate A, which evaluates B (cycle), B re-entrantly evaluates C
// -> C's InnerModuleEvaluation encounters B in Evaluating status but not on stack
// -> ASSERTION FAILURE on debug builds
// -> State machine corruption on release builds
moduleEvaluate(aMod);
