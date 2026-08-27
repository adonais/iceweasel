const m = new WebAssembly.Module(wasmTextToBinary(`(module
  (type $a (sub (struct (field (mut i32)))))
  (type $b (sub $a (struct (field (mut i32)) (field i32))))
  (type $c (sub (struct ${"(field i32)".repeat(100)} (field (mut i32)))))
  (type $d (sub $c (struct ${"(field i32)".repeat(100)} (field (mut i32)) (field i32))))

  (func $goof (param (ref null $b) (ref $a)) (result i32)
    ;; Load the field
    (struct.get $a 0 (local.get 0))
    drop

    ;; Set the field
    (struct.set $a 0 (local.get 1) (i32.const 123))

    ;; Load the field again (should not be combined with first load)
    (struct.get $a 0 (local.get 0))
  )
  (func (export "test") (result i32)
    (local (ref null $b))

    (local.set 0 (struct.new_default $b))
    (call $goof (local.get 0) (ref.cast (ref $a) (local.get 0)))
  )

  (func $goof2 (param (ref null $d) (ref $c)) (result i32)
    ;; Same, but out of line fields
    (struct.get $c 100 (local.get 0))
    drop
    (struct.set $c 100 (local.get 1) (i32.const 123))
    (struct.get $c 100 (local.get 0))
  )
  (func (export "test2") (result i32)
    (local (ref null $d))

    (local.set 0 (struct.new_default $d))
    (call $goof2 (local.get 0) (ref.cast (ref $c) (local.get 0)))
  )
)`));
const { test, test2 } = new WebAssembly.Instance(m).exports;
assertEq(test(), 123);
assertEq(test2(), 123);
