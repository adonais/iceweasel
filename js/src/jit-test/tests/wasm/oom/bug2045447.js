// More than 8 ref-typed parameters force Instance::callExport's rooted refs
// vector (inline capacity 8) past its inline storage, performing a fallible
// heap allocation. An OOM there must report the failure so the failing native
// leaves a pending exception; otherwise CallJSNative asserts that the context
// is in an exceptional state.
//
// The gc() before each call discards the lazily-created jit-entry stub, so the
// call stays on the slow WasmCall -> Instance::callExport path that holds the
// fallible refs.emplaceBack.

let binary = wasmTextToBinary(`(module
  (func (export "f")
    (param externref externref externref externref externref
           externref externref externref externref externref))
)`);
let instance = new WebAssembly.Instance(new WebAssembly.Module(binary));
let f = instance.exports.f;
let a = {};

for (let i = 1; i < 500; i++) {
  gc();
  oomAtAllocation(i);
  try {
    f(a, a, a, a, a, a, a, a, a, a);
  } catch (e) {}
  resetOOMFailure();
}
