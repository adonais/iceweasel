// |jit-test| skip-if: !largeArrayBufferSupported(); allow-oom

// Test i32 index register is zero-extended.

const rmw_ops = {
  add: (x, y) => (x + y),
  sub: (x, y) => (x - y),
  and: (x, y) => (x & y),
  or: (x, y) => (x | y),
  xor: (x, y) => (x ^ y),
  xchg: (x, y) => y,
};

function rmw_name(type, name, width) {
  let prefix = width < type ? String(width) : "";
  let suffix = width < type ? "_u" : "";
  return `i${type}.atomic.rmw${prefix}.${name}${suffix}`;
}

let rmw_functions = [];

for (let name of Object.keys(rmw_ops)) {
  for (let type of [64, 32]) {
    for (let width = type; width >= 8; width /= 2) {
      let op_name = rmw_name(type, name, width);

      rmw_functions.push(`
  (func (export "${op_name}") (param i32) (param i${type}) (result i${type})
    (${op_name} (local.get 0) (local.get 1))
  )
  (func (export "${op_name}.effect") (param i32) (param i${type})
    (${op_name} (local.get 0) (local.get 1))
    drop
  )
`);
    }
  }
}

var ins = wasmEvalText(`
(module
  ;; Larger than 2GB
  (memory (export "mem") 40000)

  ;; Load (i32)
  (func (export "i32.atomic.load") (param i32) (result i32)
    (i32.atomic.load (local.get 0))
  )
  (func (export "i32.atomic.load8_u") (param i32) (result i32)
    (i32.atomic.load8_u (local.get 0))
  )
  (func (export "i32.atomic.load16_u") (param i32) (result i32)
    (i32.atomic.load16_u (local.get 0))
  )

  ;; Load (i64)
  (func (export "i64.atomic.load") (param i32) (result i64)
    (i64.atomic.load (local.get 0))
  )
  (func (export "i64.atomic.load8_u") (param i32) (result i64)
    (i64.atomic.load8_u (local.get 0))
  )
  (func (export "i64.atomic.load16_u") (param i32) (result i64)
    (i64.atomic.load16_u (local.get 0))
  )
  (func (export "i64.atomic.load32_u") (param i32) (result i64)
    (i64.atomic.load32_u (local.get 0))
  )

  ;; Store (i32)
  (func (export "i32.atomic.store") (param i32) (param i32)
    (i32.atomic.store (local.get 0) (local.get 1))
  )
  (func (export "i32.atomic.store8") (param i32) (param i32)
    (i32.atomic.store8 (local.get 0) (local.get 1))
  )
  (func (export "i32.atomic.store16") (param i32) (param i32)
    (i32.atomic.store16 (local.get 0) (local.get 1))
  )

  ;; Store (i64)
  (func (export "i64.atomic.store") (param i32) (param i64)
    (i64.atomic.store (local.get 0) (local.get 1))
  )
  (func (export "i64.atomic.store8") (param i32) (param i64)
    (i64.atomic.store8 (local.get 0) (local.get 1))
  )
  (func (export "i64.atomic.store16") (param i32) (param i64)
    (i64.atomic.store16 (local.get 0) (local.get 1))
  )
  (func (export "i64.atomic.store32") (param i32) (param i64)
    (i64.atomic.store32 (local.get 0) (local.get 1))
  )
  
  ;; CompareExchange (i32)
  (func (export "i32.atomic.rmw.cmpxchg") (param i32) (param i32) (param i32) (result i32)
    (i32.atomic.rmw.cmpxchg (local.get 0) (local.get 1) (local.get 2))
  )
  (func (export "i32.atomic.rmw8.cmpxchg_u") (param i32) (param i32) (param i32) (result i32)
    (i32.atomic.rmw8.cmpxchg_u (local.get 0) (local.get 1) (local.get 2))
  )
  (func (export "i32.atomic.rmw16.cmpxchg_u") (param i32) (param i32) (param i32) (result i32)
    (i32.atomic.rmw16.cmpxchg_u (local.get 0) (local.get 1) (local.get 2))
  )
  
  ;; CompareExchange (i64)
  (func (export "i64.atomic.rmw.cmpxchg") (param i32) (param i64) (param i64) (result i64)
    (i64.atomic.rmw.cmpxchg (local.get 0) (local.get 1) (local.get 2))
  )
  (func (export "i64.atomic.rmw8.cmpxchg_u") (param i32) (param i64) (param i64) (result i64)
    (i64.atomic.rmw8.cmpxchg_u (local.get 0) (local.get 1) (local.get 2))
  )
  (func (export "i64.atomic.rmw16.cmpxchg_u") (param i32) (param i64) (param i64) (result i64)
    (i64.atomic.rmw16.cmpxchg_u (local.get 0) (local.get 1) (local.get 2))
  )
  (func (export "i64.atomic.rmw32.cmpxchg_u") (param i32) (param i64) (param i64) (result i64)
    (i64.atomic.rmw32.cmpxchg_u (local.get 0) (local.get 1) (local.get 2))
  )

  ;; RMW
  ${rmw_functions.join("\n")}
)`);

var ab = ins.exports.mem.buffer;
var dv = new DataView(ab);

var index = 0x80000000;
assertEq(ab.byteLength > index, true);

// Load (i32)
dv.setInt32(index, 0, true);
assertEq(ins.exports["i32.atomic.load"](index), 0);
assertEq(ins.exports["i32.atomic.load8_u"](index), 0);
assertEq(ins.exports["i32.atomic.load16_u"](index), 0);

dv.setInt32(index, 0xaabbccdd, true);
assertEq(ins.exports["i32.atomic.load"](index), 0xaabbccdd|0);
assertEq(ins.exports["i32.atomic.load8_u"](index), 0xdd);
assertEq(ins.exports["i32.atomic.load16_u"](index), 0xccdd);

// Load (i64)
dv.setBigInt64(index, 0n, true);
assertEq(ins.exports["i64.atomic.load"](index), 0n);
assertEq(ins.exports["i64.atomic.load8_u"](index), 0n);
assertEq(ins.exports["i64.atomic.load16_u"](index), 0n);
assertEq(ins.exports["i64.atomic.load32_u"](index), 0n);

dv.setBigInt64(index, 0xaabbccdd_eeff1122n, true);
assertEq(ins.exports["i64.atomic.load"](index), BigInt.asIntN(64, 0xaabbccdd_eeff1122n));
assertEq(ins.exports["i64.atomic.load8_u"](index), 0x22n);
assertEq(ins.exports["i64.atomic.load16_u"](index), 0x1122n);
assertEq(ins.exports["i64.atomic.load32_u"](index), 0xeeff1122n);

// Store (i32)
dv.setInt32(index, 0, true);
ins.exports["i32.atomic.store"](index, 0xaabbccdd);
assertEq(dv.getInt32(index, true), 0xaabbccdd|0);

dv.setInt32(index, 0, true);
ins.exports["i32.atomic.store8"](index, 0xaabbccdd);
assertEq(dv.getInt32(index, true), 0xdd);

dv.setInt32(index, 0, true);
ins.exports["i32.atomic.store16"](index, 0xaabbccdd);
assertEq(dv.getInt32(index, true), 0xccdd);

// Store (i64)
dv.setBigInt64(index, 0n, true);
ins.exports["i64.atomic.store"](index, 0xaabbccdd_eeff1122n);
assertEq(dv.getBigInt64(index, true), BigInt.asIntN(64, 0xaabbccdd_eeff1122n));

dv.setBigInt64(index, 0n, true);
ins.exports["i64.atomic.store8"](index, 0xaabbccdd_eeff1122n);
assertEq(dv.getBigInt64(index, true), 0x22n);

dv.setBigInt64(index, 0n, true);
ins.exports["i64.atomic.store16"](index, 0xaabbccdd_eeff1122n);
assertEq(dv.getBigInt64(index, true), 0x1122n);

dv.setBigInt64(index, 0n, true);
ins.exports["i64.atomic.store32"](index, 0xaabbccdd_eeff1122n);
assertEq(dv.getBigInt64(index, true), 0xeeff1122n);

// CompareExchange (i32)
dv.setInt32(index, 0x0f0f0f0f, true);
assertEq(ins.exports["i32.atomic.rmw.cmpxchg"](index, 0, 0xaabbccdd), 0x0f0f0f0f);
assertEq(dv.getInt32(index, true), 0x0f0f0f0f);
assertEq(ins.exports["i32.atomic.rmw.cmpxchg"](index, 0x0f0f0f0f, 0xaabbccdd), 0x0f0f0f0f);
assertEq(dv.getInt32(index, true), 0xaabbccdd|0);

dv.setInt32(index, 0x0f0f0f0f, true);
assertEq(ins.exports["i32.atomic.rmw8.cmpxchg_u"](index, 0, 0xaabbccdd), 0x0f);
assertEq(dv.getInt32(index, true), 0x0f0f0f0f);
assertEq(ins.exports["i32.atomic.rmw8.cmpxchg_u"](index, 0x0f0f0f0f, 0xaabbccdd), 0x0f);
assertEq(dv.getInt32(index, true), 0x0f0f0fdd);

dv.setInt32(index, 0x0f0f0f0f, true);
assertEq(ins.exports["i32.atomic.rmw16.cmpxchg_u"](index, 0, 0xaabbccdd), 0x0f0f);
assertEq(dv.getInt32(index, true), 0x0f0f0f0f);
assertEq(ins.exports["i32.atomic.rmw16.cmpxchg_u"](index, 0x0f0f0f0f, 0xaabbccdd), 0x0f0f);
assertEq(dv.getInt32(index, true), 0x0f0fccdd);

// CompareExchange (i64)
dv.setBigInt64(index, 0x0f0f0f0f_0f0f0f0fn, true);
assertEq(ins.exports["i64.atomic.rmw.cmpxchg"](index, 0n, 0xaabbccdd_eeff1122n), 0x0f0f0f0f_0f0f0f0fn);
assertEq(dv.getBigInt64(index, true), 0x0f0f0f0f_0f0f0f0fn);
assertEq(ins.exports["i64.atomic.rmw.cmpxchg"](index, 0x0f0f0f0f_0f0f0f0fn, 0xaabbccdd_eeff1122n), 0x0f0f0f0f_0f0f0f0fn);
assertEq(dv.getBigInt64(index, true), BigInt.asIntN(64, 0xaabbccdd_eeff1122n));

dv.setBigInt64(index, 0x0f0f0f0f_0f0f0f0fn, true);
assertEq(ins.exports["i64.atomic.rmw8.cmpxchg_u"](index, 0n, 0xaabbccdd_eeff1122n), 0x0fn);
assertEq(dv.getBigInt64(index, true), 0x0f0f0f0f_0f0f0f0fn);
assertEq(ins.exports["i64.atomic.rmw8.cmpxchg_u"](index, 0x0f0f0f0f_0f0f0f0fn, 0xaabbccdd_eeff1122n), 0x0fn);
assertEq(dv.getBigInt64(index, true), 0x0f0f0f0f_0f0f0f22n);

dv.setBigInt64(index, 0x0f0f0f0f_0f0f0f0fn, true);
assertEq(ins.exports["i64.atomic.rmw16.cmpxchg_u"](index, 0n, 0xaabbccdd_eeff1122n), 0x0f0fn);
assertEq(dv.getBigInt64(index, true), 0x0f0f0f0f_0f0f0f0fn);
assertEq(ins.exports["i64.atomic.rmw16.cmpxchg_u"](index, 0x0f0f0f0f_0f0f0f0fn, 0xaabbccdd_eeff1122n), 0x0f0fn);
assertEq(dv.getBigInt64(index, true), 0x0f0f0f0f_0f0f1122n);

dv.setBigInt64(index, 0x0f0f0f0f_0f0f0f0fn, true);
assertEq(ins.exports["i64.atomic.rmw32.cmpxchg_u"](index, 0n, 0xaabbccdd_eeff1122n), 0x0f0f0f0fn);
assertEq(dv.getBigInt64(index, true), 0x0f0f0f0f_0f0f0f0fn);
assertEq(ins.exports["i64.atomic.rmw32.cmpxchg_u"](index, 0x0f0f0f0f_0f0f0f0fn, 0xaabbccdd_eeff1122n), 0x0f0f0f0fn);
assertEq(dv.getBigInt64(index, true), 0x0f0f0f0f_eeff1122n);
assertEq(ins.exports["i64.atomic.load"](index), 0x0f0f0f0f_eeff1122n);

// RMW
for (let [name, op] of Object.entries(rmw_ops)) {
  for (let width of [32, 16, 8]) {
    let mask = (2 ** width) - 1;

    let init = 0x0f0f0f0f;
    let value = 0xaabbccdd;
    let expected = (op(init, value) & mask) | (init & ~mask);

    let exp_name = rmw_name(32, name, width);

    dv.setInt32(index, init, true);
    assertEq(ins.exports[exp_name](index, value), init & mask);
    assertEq(dv.getInt32(index, true), expected);

    // for effect
    dv.setInt32(index, init, true);
    assertEq(ins.exports[`${exp_name}.effect`](index, value), undefined);
    assertEq(dv.getInt32(index, true), expected);
  }

  for (let width of [64, 32, 16, 8]) {
    let mask = (2n ** BigInt(width)) - 1n;

    let init = 0x0f0f0f0f_0f0f0f0fn;
    let value = 0xaabbccdd_eeff1122n;
    let expected = BigInt.asIntN(64, (op(init, value) & mask) | (init & ~mask));

    let exp_name = rmw_name(64, name, width);

    dv.setBigInt64(index, init, true);
    assertEq(ins.exports[exp_name](index, value), init & mask);
    assertEq(dv.getBigInt64(index, true), expected);

    // for effect
    dv.setBigInt64(index, init, true);
    assertEq(ins.exports[`${exp_name}.effect`](index, value), undefined);
    assertEq(dv.getBigInt64(index, true), expected);
  }
}
