// |jit-test| module; skip-if: !getBuildConfiguration("source-phase-imports") || !wasmIsSupported(); --enable-source-phase-imports; --enable-wasm-esm-integration

import source mod from "empty.wasm";
import source exportsFun from "exports-fun.wasm";

assertEq(mod instanceof WebAssembly.Module, true);

const AbstractModuleSource = getAbstractModuleSource();
assertEq(mod instanceof AbstractModuleSource, true);

assertEq(exportsFun instanceof WebAssembly.Module, true);
const instance = new WebAssembly.Instance(exportsFun);
assertEq(typeof instance.exports.fun, "function");
assertEq(instance.exports.fun(3, 4), 7);

// Importing the same module as evaluation phase after source phase
// is safe, but throws a SyntaxError because we haven't implemented
// evaluation phase yet.
let error = null;
try {
  await import("empty.wasm");
} catch (e) {
  error = e;
}
assertEq(error instanceof SyntaxError, true);

let compileError = null;
try {
  await import.source("invalid.wasm");
} catch (e) {
  compileError = e;
}
assertEq(compileError instanceof WebAssembly.CompileError, true);
assertEq(compileError.fileName.endsWith("invalid.wasm"), true);

