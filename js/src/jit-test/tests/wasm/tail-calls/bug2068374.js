// |jit-test| skip-if: getBuildConfiguration("simulator")

// A cross-instance return_call_indirect switches to the callee's realm and
// collapses the caller's frame before the callee's prologue checks the
// signature. Reporting the resulting trap allocates and can trigger a GC, so
// the realm the trap unwinds to must be the one left current.

function mk(text, imports) {
  return new WebAssembly.Instance(
      new WebAssembly.Module(wasmTextToBinary(text)), imports);
}

function build() {
  var d = mk(`(module
    (type $ft (func (param i32) (param i32) (result i32)))
    (global $g (mut (ref null $ft)) (ref.null $ft))
    (func (export "setG") (param (ref null $ft)) (global.set $g (local.get 0)))
    (func (export "k2") (param i32) (param i32) (result i32)
      (local (ref null $ft))
      (local.set 2 (global.get $g))
      (global.set $g (ref.null $ft))
      (return_call_ref $ft (local.get 0) (local.get 1) (local.get 2)))
  )`);

  // The table entry has a different signature than the return_call_indirect
  // site, and belongs to an instance in another realm of the same compartment,
  // which is the only realm switch wasm code can perform.
  var otherGlobal = newGlobal({sameCompartmentAs: this});
  var c = otherGlobal.eval(`new WebAssembly.Instance(new WebAssembly.Module(
      wasmTextToBinary('(module (func (export "g") (param i64) (result i64) ' +
                       '(local.get 0)))')))`);
  var tab = new WebAssembly.Table({initial: 1, element: "anyfunc"});
  tab.set(0, c.exports.g);

  var a = mk(`(module
    (import "" "t" (table 1 funcref))
    (type $sig (func (param i32) (result i32)))
    (type $arr (array (mut i8)))
    (func (export "f") (param i32) (param i32) (result i32)
      (drop (array.new_default $arr (i32.const 67108864)))
      (return_call_indirect (type $sig) (local.get 0) (local.get 1))))
  `, {"": {t: tab}});
  d.exports.setG(a.exports.f);
  return d;
}

var d = build();

// Make the trap error report allocate into a GC that sweeps realms.
gcparam("nurseryEnabled", 0);
gcparam("mallocThresholdBase", 1);
gcparam("sliceTimeBudgetMS", 0);
gc();

assertErrorMessage(() => d.exports.k2(1, 0), WebAssembly.RuntimeError,
                   /indirect call signature mismatch/);
