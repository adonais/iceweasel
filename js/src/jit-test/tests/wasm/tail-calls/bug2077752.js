// |jit-test| skip-if: !('newGlobal' in this)
// return_call to a trapping function in another same-compartment realm must
// restore the caller's realm while unwinding.
const other = newGlobal({sameCompartmentAs: globalThis});
const trap = new other.WebAssembly.Instance(new other.WebAssembly.Module(
    wasmTextToBinary(`(module (func (export "t") unreachable))`))).exports.t;
const { table } = new WebAssembly.Instance(new WebAssembly.Module(
    wasmTextToBinary(`(module
      (import "" "t" (func $t))
      (func $run return_call $t)
      (table (export "table") 1 funcref)
      (elem (i32.const 0) $run))`)), {"": {t: trap}}).exports;
let error;
try {
  table.get(0)();
} catch (e) {
  error = e;
}
assertEq(/unreachable/.test(String(error)), true);
