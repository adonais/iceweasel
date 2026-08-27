// |jit-test| --setpref=wasm_lazy_tiering=true; --setpref=wasm_lazy_tiering_synchronous=true; --setpref=wasm_lazy_tiering_level=9; --setpref=wasm_inlining_level=9; skip-if: !wasmLazyTieringEnabled()
//
// Two Ion phi-allocation loops in WasmIonCompile.cpp create one MPhi per
// element infallibly on a module-controlled trip count. Without a prior
// ensureBallast(), a wide signature exhausts the TempAllocator ballast and
// LifoAlloc asserts allocating a fresh chunk in an infallible scope.

const types = ["i32", "i64", "f32", "f64"];

// 1) finishInlinedCallDirect: one phi per inlined callee result. When the hot
//    export tiers up, Ion inlines $mid/$multi and builds the join block with a
//    phi per result of the wide multi-value signature.
{
  const N = 100;
  let params = [], results = [], passthrough = [], consts = [];
  for (let i = 0; i < N; i++) {
    const t = types[i % 4];
    params.push(t);
    results.push(t);
    passthrough.push(`(local.get ${i})`);
    consts.push(t === "i32" ? `(i32.const ${i})`
              : t === "i64" ? `(i64.const ${i})`
              : t === "f32" ? `(f32.const ${i})`
              :               `(f64.const ${i})`);
  }
  const wat = `(module
    (func $multi (param ${params.join(" ")}) (result ${results.join(" ")})
      ${passthrough.join(" ")})
    (func $mid (param ${params.join(" ")}) (result ${results.join(" ")})
      ${passthrough.join(" ")}
      (call $multi))
    (func (export "run") (result ${results.join(" ")})
      ${consts.join(" ")}
      (call $mid))
  )`;
  const inst = new WebAssembly.Instance(new WebAssembly.Module(wasmTextToBinary(wat)));
  for (let i = 0; i < 20; i++) {
    inst.exports.run();
  }
}

// 2) The loop-header builder: one phi per loop block-parameter. A hot function
//    whose loop has a wide block-parameter signature exercises the same
//    infallible allocation.
{
  const N = 300;
  const ptypes = Array(N).fill("i32").join(" ");
  const zeros = Array(N).fill("(i32.const 0)").join(" ");
  const drops = Array(N - 1).fill("(drop)").join(" ");
  const wat = `(module
    (func (export "run") (param $n i32) (result i32)
      (local $i i32)
      ${zeros}
      (loop $l (param ${ptypes}) (result ${ptypes})
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br_if $l (i32.lt_s (local.get $i) (local.get $n)))
      )
      ${drops}
    )
  )`;
  const inst = new WebAssembly.Instance(new WebAssembly.Module(wasmTextToBinary(wat)));
  for (let i = 0; i < 20; i++) {
    inst.exports.run(2);
  }
}
