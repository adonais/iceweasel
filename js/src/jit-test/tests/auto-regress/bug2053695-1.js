// |jit-test| skip-if: !wasmIsSupported(); include:wasm.js

let {exports: {sub32, sub64}} = wasmEvalText(`(module
  (func (export "sub32") (param i32) (result i32)
    (i32.sub (local.get 0) (i32.const -4096))
  )
  (func (export "sub64") (param i64) (result i64)
    (i64.sub (local.get 0) (i64.const -4096))
  )
)`);

assertEq(sub32(0), 4096);
assertEq(sub32(1), 4097);
assertEq(sub32(-1), 4095);

assertEq(sub64(0n), 4096n);
assertEq(sub64(1n), 4097n);
assertEq(sub64(-1n), 4095n);
