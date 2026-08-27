// |jit-test| --wasm-compiler=ion; --no-threads; skip-if: !wasmIsSupported() || !('oomTest' in this)

// If MWasmStore::New() fails under OOM, FunctionCompiler::store() must fail the
// Ion compilation rather than silently dropping the store node and reporting
// success. Otherwise a successfully-compiled module runs with the store missing.
//
// oomTest ignores exceptions thrown from its callback, so a failed store cannot
// be detected with assertEq inside the callback: record any miscompile in an
// outer variable and assert on it afterwards.

const code = wasmTextToBinary(`(module
  (memory (export "mem") 1)
  (func (export "f")
    i32.const 64
    i32.const 0x41414141
    i32.store))`);

let miscompiles = 0;
oomTest(() => {
  // If instantiation succeeds despite an injected OOM, the store must have been
  // emitted; a dropped store leaves mem[64] at its zero-initialized value.
  const inst = new WebAssembly.Instance(new WebAssembly.Module(code));
  inst.exports.f();
  const mem = new Uint32Array(inst.exports.mem.buffer);
  if (mem[16] !== 0x41414141) {
    miscompiles++;
  }
});

assertEq(miscompiles, 0);
