function test(op, x0, n, expected) {
  const text = `
  (module
    (func (export "f") (param $n i32) (result i32)
      (local $x i32) (local $acc i32) (local $i i32)
      (local.set $x (i32.const ${x0}))
      (loop $L
        (local.set $acc (i32.add (local.get $acc) ${op}))
        (local.set $x (local.get $n))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br_if $L (i32.lt_u (local.get $i) (local.get $n))))
      (local.get $acc)))
  `;
  const { exports } = new WebAssembly.Instance(
    new WebAssembly.Module(wasmTextToBinary(text))
  );
  assertEq(exports.f(n), expected);
}

test("(i32.shr_u (local.get $x) (i32.const 0))", -1, 3, 5);
test("(i32.shr_u (local.get $x) (i32.const 32))", -1, 3, 5);
test("(i32.div_u (local.get $x) (i32.const 1))", -1, 3, 5);
test("(i32.rem_u (local.get $x) (i32.const -1))", -2, 3, 4);
