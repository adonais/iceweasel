// |jit-test| skip-if: !largeArrayBufferSupported(); allow-oom

// i32 index register is zero-extended. Ensure the original register value
// isn't clobbered.

let ins = wasmEvalText(`
(module
  ;; Larger than 2GB
  (memory (export "mem") 40000)

  (func (export "load_i32") (param i32) (result i32)
    ;; i32.store to add a use for the i32.load
    (i32.store (i32.const 0) (i32.load (local.get 0)))

    ;; Test if index has its sign-bit set.
    (i32.lt_s (local.get 0) (i32.const 0))
  )

  (func (export "store_i32") (param i32) (result i32)
    (i32.store (local.get 0) (i32.const 0))

    ;; Test if index has its sign-bit set.
    (i32.lt_s (local.get 0) (i32.const 0))
  )

  (func (export "load_i64") (param i32) (result i32)
    ;; i64.store to add a use for the i64.load
    (i64.store (i32.const 0) (i64.load (local.get 0)))

    ;; Test if index has its sign-bit set.
    (i32.lt_s (local.get 0) (i32.const 0))
  )

  (func (export "store_i64") (param i32) (result i32)
    (i64.store (local.get 0) (i64.const 0))

    ;; Test if index has its sign-bit set.
    (i32.lt_s (local.get 0) (i32.const 0))
  )
)`);

assertEq(ins.exports.mem.buffer.byteLength > 0x80000000, true);

assertEq(ins.exports.load_i32(0x80000000), 1);
assertEq(ins.exports.store_i32(0x80000000), 1);
assertEq(ins.exports.load_i64(0x80000000), 1);
assertEq(ins.exports.store_i64(0x80000000), 1);
