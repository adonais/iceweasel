// |jit-test| skip-if: !wasmDebuggingEnabled()

// A GC while an import-function wrapper's frame is on the stack, in a
// debug-enabled module.  The wrapper is reached by calling an imported
// function through a table.

var g = newGlobal({newCompartment: true});
var dbg = new Debugger(g);
g.bin = wasmTextToBinary(`(module
  (import "m" "f" (func $f (param externref) (result i32)))
  (type $t (func (param externref) (result i32)))
  (table funcref (elem $f))
  (func (export "run") (param externref) (result i32)
    (call_indirect (type $t) (local.get 0) (i32.const 0))))`);
g.eval(`
  var ins = new WebAssembly.Instance(new WebAssembly.Module(bin),
                                     {m: {f: (x) => { gc(); return 1; }}});
  var result = ins.exports.run({});
`);
assertEq(g.result, 1);
