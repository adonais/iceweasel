// |jit-test| skip-if: !wasmIsSupported(); include:wasm.js

let {exports: {divuw, remuw}} = wasmEvalText(`(module
  (func (export "divuw") (param i32) (param i32) (result i32)
    (i32.lt_s (i32.const 0) (i32.div_u (local.get 0) (local.get 1)))
  )
  (func (export "remuw") (param i32) (param i32) (result i32)
    (i32.lt_s (i32.const 0) (i32.rem_u (local.get 0) (local.get 1)))
  )
)`);

assertEq(divuw(-1, 1), 0);
assertEq(remuw(0x8000_0000, 0x8000_0001), 0);
