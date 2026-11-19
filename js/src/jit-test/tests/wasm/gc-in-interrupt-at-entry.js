// A GC from an interrupt taken at wasm function entry must trace and update
// ref-typed arguments, whether they were passed in registers or on the stack.

var bin = wasmTextToBinary(`(module
  (import "m" "arm" (func $arm))
  (func $f (param externref externref externref externref
                  externref externref externref externref
                  externref externref externref externref)
           (param i32) (result externref)
    (if (result externref) (local.get 12)
      (then (local.get 0))
      (else (local.get 11))))
  (func (export "run") (param externref externref i32) (result externref)
    (call $arm)
    (call $f (local.get 0) (local.get 1) (local.get 1) (local.get 1)
             (local.get 1) (local.get 1) (local.get 1) (local.get 1)
             (local.get 1) (local.get 1) (local.get 1) (local.get 0)
             (local.get 2))))`);
var ins = new WebAssembly.Instance(new WebAssembly.Module(bin),
                                   {m: {arm: () => interruptIf(true)}});
setInterruptCallback(() => { minorgc(); return true; });
for (var i = 0; i < 200; i++) {
  var a = {x: i}, b = {y: i};
  assertEq(ins.exports.run(a, b, 1).x, i);
  var a2 = {x: -i};
  assertEq(ins.exports.run(a2, b, 0).x, -i);
}
