// |jit-test| skip-if: !wasmStackSwitchingEnabled()

// Regression test for bug 2035790: self-referencing or mutually-referencing
// cont types in a recursion group must not crash with a stack overflow.

assertErrorMessage(
  () => new WebAssembly.Module(wasmTextToBinary(`(module
    (rec
      (type $ct (cont $ct))
    )
  )`)),
  WebAssembly.CompileError,
  /cont must reference a func type/
);

assertErrorMessage(
  () => new WebAssembly.Module(wasmTextToBinary(`(module
    (rec
      (type $ct1 (cont $ct2))
      (type $ct2 (cont $ct1))
    )
  )`)),
  WebAssembly.CompileError,
  /cont must reference a func type/
);
