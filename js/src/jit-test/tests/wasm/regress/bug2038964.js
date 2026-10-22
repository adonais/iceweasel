// |jit-test| skip-if: !wasmLazyTieringEnabled(); -P wasm_lazy_tiering; -P wasm_lazy_tiering_synchronous; -P wasm_lazy_tiering_level=9

function test() {
  var mod = new WebAssembly.Module(wasmTextToBinary(`
    (module
      (tag $e (param i32))
      (func $thrower (param i32) (throw $e (local.get 0)))
      (func (export "f") (param i32) (result i32)
        (block $caught (result i32)
          (try_table (result i32) (catch $e $caught)
            (call $thrower (local.get 0))
            (i32.const -1)
          )
          (return)
        )
        (i32.add (i32.const 1000))
      )
    )
  `));
  var inst = new WebAssembly.Instance(mod);
  assertEq(inst.exports.f(42), 1042);
}

oomTest(test);
