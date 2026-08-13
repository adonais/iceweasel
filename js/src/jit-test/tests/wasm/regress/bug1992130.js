// Test StableWasmArrayObjectElements inline array copy.

var ins = wasmEvalText(`(module
  (type $arr (array (mut i16)))
  (func $fromCharCodeArray
    (import "wasm:js-string" "fromCharCodeArray")
    (param (ref null $arr) i32 i32)
    (result (ref extern)))
  (func (export "test") (result externref)
    (call $fromCharCodeArray
      (array.new $arr (i32.const 0x41) (i32.const 50))
      (i32.const 0)
      (i32.const 50)))
)`, {},  {builtins: ['js-string']});

oomTest(
    () => {
        inst.exports.test()
    },
);
