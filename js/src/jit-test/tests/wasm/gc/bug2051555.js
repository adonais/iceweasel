// |jit-test| allow-oom; skip-if: !hasFunction.oomAfterAllocations || !hasFunction.gczeal

// Out-of-line wasm GC arrays can OOM while allocating the out-of-line area,
// which leaves a sort of "zombie array" that is unreachable but still needs to
// be handled by our GC machinery. Before bug 2051555 this was identifiable by
// a null data pointer and zero length. Bug 2041977 added extra handling for
// this to obj_trace, but really should have also updated obj_moved (among
// other places).
//
// It is very difficult to persuade such a zombie array to be moved instead of
// collected in the nursery, but if this happens, it can trigger asserts from
// isDataInline(). These have been manifesting very intermittently. The
// following test case manages to make it reproduce, however.

const mod = new WebAssembly.Module(wasmTextToBinary(`(module
  (type $arr (array (mut i64)))
  (global (ref null $arr) (array.new_default $arr (i32.const 200)))
)`));

gczeal(0);

for (let attempt = 0; attempt < 10; attempt++) {
  // Begin an incremental, shrinking (compacting) GC, stopped in the Mark
  // phase, so subsequent allocations are black (treated as live this cycle).
  startgc(1, "shrinking");
  gcslice(1);

  // Allocate WasmArrayObject cells and force an OOM at the OOL data buffer
  // allocation inside createArrayOOL, leaving data_ == nullptr.
  for (let i = 1; i < 150; i++) {
    oomAfterAllocations(i);
    try { new WebAssembly.Instance(mod); } catch (e) {}
    resetOOMFailure();
  }

  // Drive the GC through its Compact phase. Relocating a black partial array
  // calls WasmArrayObject::obj_moved -> isDataInline(nullptr).
  while (gcstate() !== "NotActive") {
    gcslice(10000);
  }
}
print("survived");
