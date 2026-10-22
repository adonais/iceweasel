// |jit-test| skip-if: !wasmStackSwitchingEnabled()

// Test that a continuation created by cont.new with a cross-module target
// funcref keeps the creator module's code alive (no use-after-free of the
// resumePC / ContBaseFrame stub).
//
// Regression test for bug 2043034: Instance::contNew captured the resume stub
// from the *creator* module's code but only kept the *target* module alive via
// GC roots.  After a GC collected the creator, the dangling resumePC caused a
// wild jump on the next resume.

function mod(text) { return new WebAssembly.Module(wasmTextToBinary(text)); }

// Module C stays alive the whole time.  It exports a target function $g that
// records it ran, a sink that stores a received continuation, and go that
// resumes it.
let cMod = mod(`(module
  (type $ft (func))
  (type $ct (cont $ft))
  (global $k (mut (ref null $ct)) (ref.null $ct))
  (global $ran (export "ran") (mut i32) (i32.const 0))
  (func (export "g") (type $ft) i32.const 1 global.set $ran)
  (func (export "sink") (param (ref null $ct)) local.get 0 global.set $k)
  (func (export "go") global.get $k resume $ct)
)`);
let cInst = new WebAssembly.Instance(cMod);

// Module A (the creator) is scoped to an IIFE so it can be GC'd.  It uses
// cont.new with C's $g as the target, capturing the resume stub from A's own
// code, then transfers the continuation to C.
(function () {
  let aMod = mod(`(module
    (type $ft (func))
    (type $ct (cont $ft))
    (import "c" "g"    (func $g    (type $ft)))
    (import "c" "sink" (func $sink (param (ref null $ct))))
    (elem declare func $g)
    (func (export "mk")
      ref.func $g
      cont.new $ct
      call $sink)
  )`);
  let aInst = new WebAssembly.Instance(aMod, {
    c: { g: cInst.exports.g, sink: cInst.exports.sink }
  });
  aInst.exports.mk();
})();

// Collect module A.  Before the fix this freed the ContBaseFrame stub that the
// continuation's resumePC points at.
gc();

// Resume the continuation.  Before the fix this was a wild jump into freed code.
cInst.exports.go();

assertEq(cInst.exports.ran.value, 1);
