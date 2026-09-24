wasmEvalText(`(module
  (type $s (struct ${"(field (mut i64))".repeat(17)}))
  (func (param $r (ref null $s)) (result i64)
    (local $i i32)

    (local.set $i (i32.const 10))
    loop $L
      (struct.set $s 16 (local.get $r) (i64.const 1))
      (local.tee $i (i32.sub (local.get $i) (i32.const 1)))
      br_if $L
    end
    (struct.get $s 16 (local.get $r))
  )
)`);
