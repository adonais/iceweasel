// Storing constants to struct fields, including through a null reference.

const text = `(module
  (type $s (struct (field (mut i8)) (field (mut i16)) (field (mut i32))
                   (field (mut i64))))
  (func (export "make") (result (ref null $s))
    (struct.new $s (i32.const 1) (i32.const 2) (i32.const 3) (i64.const 4)))
  (func (export "makeZero") (result (ref null $s))
    (struct.new $s (i32.const 0) (i32.const 0) (i32.const 0) (i64.const 0)))
  (func (export "zero") (param (ref null $s))
    (struct.set $s 0 (local.get 0) (i32.const 0))
    (struct.set $s 1 (local.get 0) (i32.const 0))
    (struct.set $s 2 (local.get 0) (i32.const 0))
    (struct.set $s 3 (local.get 0) (i64.const 0)))
  (func (export "consts") (param (ref null $s))
    (struct.set $s 0 (local.get 0) (i32.const -1))
    (struct.set $s 1 (local.get 0) (i32.const 0x12345))
    (struct.set $s 2 (local.get 0) (i32.const -2))
    (struct.set $s 3 (local.get 0) (i64.const 0x123456789)))
  (func (export "consts64") (param (ref null $s))
    (struct.set $s 3 (local.get 0) (i64.const -3)))
  (func (export "zero8") (param (ref null $s))
    (struct.set $s 0 (local.get 0) (i32.const 0)))
  (func (export "zero64") (param (ref null $s))
    (struct.set $s 3 (local.get 0) (i64.const 0)))
  (func (export "sum") (param (ref null $s)) (result i64)
    (i64.add
      (i64.add (i64.extend_i32_u (struct.get_u $s 0 (local.get 0)))
               (i64.extend_i32_u (struct.get_u $s 1 (local.get 0))))
      (i64.add (i64.extend_i32_u (struct.get $s 2 (local.get 0)))
               (struct.get $s 3 (local.get 0)))))
)`;

let {exports: e} = wasmEvalText(text);

for (let i = 0; i < 100; i++) {
  let o = e.make();
  assertEq(e.sum(o), 10n);
  e.zero(o);
  assertEq(e.sum(o), 0n);
  assertEq(e.sum(e.makeZero()), 0n);
  e.consts(o);
  assertEq(e.sum(o), 0xffn + 0x2345n + 0xfffffffen + 0x123456789n);
  e.consts64(o);
  assertEq(e.sum(o), 0xffn + 0x2345n + 0xfffffffen - 3n);
}

for (let f of [e.zero, e.zero8, e.zero64, e.consts, e.consts64]) {
  assertErrorMessage(() => f(null), WebAssembly.RuntimeError,
                     /dereferencing null pointer/);
}

// A constant the backend can store directly is lowered to a constant
// allocation, which the LIR dump prints as the literal in place of a register.
if (getBuildConfiguration("jitspew")) {
  const bin = wasmTextToBinary(text);
  function storedValues(funcIndex) {
    const pass = wasmIonGetLastLIRPass(wasmGetIon(bin, funcIndex));
    return wasmIonGetAllOpcodes(pass)
        .filter(op => op.startsWith("wasmstoreslot"))
        .map(op => {
          const m = op.match(/\((-?\d+)\)/);
          return m ? m[1] : "reg";
        })
        .join();
  }
  const zero = 2, consts = 3, consts64 = 4;
  if (getBuildConfiguration("arm64")) {
    assertEq(storedValues(zero), "0,0,0,0");
    assertEq(storedValues(consts), "reg,reg,reg,reg");
    assertEq(storedValues(consts64), "reg");
  } else if (getBuildConfiguration("x64")) {
    assertEq(storedValues(zero), "0,0,0,0");
    assertEq(storedValues(consts), "-1,74565,-2,reg");
    assertEq(storedValues(consts64), "-3");
  }
}
