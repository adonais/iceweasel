// |jit-test| skip-if: !wasmLazyTieringEnabled(); -P wasm_lazy_tiering_synchronous; -P wasm_lazy_tiering_level=9; -P wasm_inlining_level=9

function test() {
  let calleeBody = "";
  for (let i = 0; i < 40; i++) {
    calleeBody += `(drop (i32.load offset=${i * 4} (local.get 0)))\n`;
  }
  calleeBody += "(i32.load (local.get 0))";

  let callerBody = "";
  for (let i = 0; i < 4; i++) {
    callerBody += "(drop (call $callee (local.get 0)))\n";
  }
  callerBody += "(call $callee (local.get 0))";

  var mod = new WebAssembly.Module(wasmTextToBinary(`
    (module
      (memory 1)
      (func $callee (param i32) (result i32)
        ${calleeBody}
      )
      (func (export "f") (param i32) (result i32)
        ${callerBody}
      )
    )
  `));
  var inst = new WebAssembly.Instance(mod);
  assertEq(inst.exports.f(0), 0);
}

oomTest(test);
