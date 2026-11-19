// |jit-test| skip-if: !wasmDebuggingEnabled() || !hasFunction["gczeal"]

// A GC during an IndirectCallBadSig trap whose callee frame has been unwound
// must trace the caller's frame using the caller's stackmap.

var g = newGlobal({newCompartment: true});
var dbg = new Debugger(g);
g.bin = wasmTextToBinary(`(module
  (type $callerT (func (result i32)))
  (type $calleeT (func (param externref externref externref externref
                              externref externref externref externref
                              externref externref externref externref)
                       (result i32)))
  (table funcref (elem $callee))
  (func $callee (type $calleeT) (i32.const 1))
  (func $middle (param externref) (result i32)
    (call_indirect (type $callerT) (i32.const 0)))
  (func (export "outer") (param externref) (result i32)
    (call $middle (local.get 0))))`);
g.eval(`
  var ins = new WebAssembly.Instance(new WebAssembly.Module(bin));
  var caught = 0;
  gczeal(2, 1);
  for (var i = 0; i < 20; i++) {
    try {
      ins.exports.outer({});
    } catch (e) {
      caught++;
    }
  }
  gczeal(0);
`);
assertEq(g.caught, 20);
