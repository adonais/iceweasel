
// Uses only web-compatible APIs (no minorgc/gczeal/gcparam).
"use strict";

function gcWrapper() {
  gc();
  return 0;
}

const wat = `
(module
  (type $i32arr (array (mut i32)))
  (import "env" "triggerGC" (func $triggerGC (result i32)))

  ;; 32 i32 elements = 128 bytes data > 112 (MaxInlineBytes) => OOL
  ;; OOL block = 136 bytes <= 256 (MaxNurseryTrailerSize) => nursery-direct
  (func (export "test") (result i32)
    (local $arr (ref $i32arr))
    (local.set $arr (array.new $i32arr (i32.const 0) (i32.const 32)))
    (array.set $i32arr (local.get $arr) (i32.const 0) (i32.const 0xCAFEBABE))
    (array.set $i32arr (local.get $arr) (i32.const 1) (i32.const 0xDEADBEEF))
    (array.set $i32arr (local.get $arr) (i32.const 15) (i32.const 0xBAADF00D))
    (array.set $i32arr (local.get $arr) (i32.const 31) (i32.const 0x1337C0DE))
    ;; GC safepoint: Ion keeps data pointer live across this call
    (drop (call $triggerGC))
    ;; Reads via (potentially stale) data pointer
    (i32.add
      (i32.add
        (array.get $i32arr (local.get $arr) (i32.const 0))
        (array.get $i32arr (local.get $arr) (i32.const 1)))
      (i32.add
        (array.get $i32arr (local.get $arr) (i32.const 15))
        (array.get $i32arr (local.get $arr) (i32.const 31))))
  )
)`;

const inst = wasmEvalText(wat, { env: { triggerGC: gcWrapper } });

let res = inst.exports.test();
assertEq(res, 2006067864);
