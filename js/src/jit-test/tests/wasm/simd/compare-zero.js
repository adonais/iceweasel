// |jit-test| skip-if: !wasmSimdEnabled()

// Lane-wise compares against an all-zero constant, with the constant on either
// side and alone or shared, on lanes holding zero, the extremes, and for floats
// -0, the infinities and NaN. Compares against other constants, on either side,
// must still match compares against the same value in a register.

const ints = [
  ["i8x16", 1, ["eq", "ne", "lt_s", "lt_u", "gt_s", "gt_u", "le_s", "le_u", "ge_s", "ge_u"]],
  ["i16x8", 2, ["eq", "ne", "lt_s", "lt_u", "gt_s", "gt_u", "le_s", "le_u", "ge_s", "ge_u"]],
  ["i32x4", 4, ["eq", "ne", "lt_s", "lt_u", "gt_s", "gt_u", "le_s", "le_u", "ge_s", "ge_u"]],
  ["i64x2", 8, ["eq", "ne", "lt_s", "gt_s", "le_s", "ge_s"]],
];
const floats = [
  ["f32x4", 4, ["eq", "ne", "lt", "gt", "le", "ge"]],
  ["f64x2", 8, ["eq", "ne", "lt", "gt", "le", "ge"]],
];

// Every value, split into vectors of 16 / size lanes.
function laneGroups(size, isFloat) {
  const bits = BigInt(8 * size);
  const values = isFloat
    ? [0, -0, 1, -1, Infinity, -Infinity, NaN, 2.5]
    : [0n, 1n, -1n, (1n << (bits - 1n)) - 1n, -(1n << (bits - 1n)), 2n, -2n,
       5n].map(v => BigInt.asUintN(8 * size, v));
  const groups = [];
  for (let i = 0; i < values.length; i += 16 / size) {
    const group = values.slice(i, i + 16 / size);
    while (group.length < 16 / size) {
      group.push(isFloat ? 0 : 0n);
    }
    groups.push(group);
  }
  return groups;
}

function writeLanes(mem, offset, size, lanes, isFloat) {
  const view = new DataView(mem.buffer);
  lanes.forEach((v, i) => {
    const at = offset + i * size;
    if (isFloat) {
      size == 4 ? view.setFloat32(at, v, true) : view.setFloat64(at, v, true);
    } else {
      for (let b = 0; b < size; b++) {
        view.setUint8(at + b, Number((v >> BigInt(8 * b)) & 0xffn));
      }
    }
  });
}

function readMask(mem, offset, size) {
  const out = [];
  for (let i = 0; i < 16 / size; i++) {
    const lane = Array.from(mem.subarray(offset + i * size, offset + (i + 1) * size));
    assertEq(lane.every(b => b == lane[0]) && (lane[0] == 0 || lane[0] == 0xff), true);
    out.push(lane[0] == 0xff);
  }
  return out;
}

function intCompare(op, size, x) {
  const s = BigInt.asIntN(8 * size, x);
  switch (op) {
    case "eq": return x == 0n;
    case "ne": return x != 0n;
    case "lt_s": return s < 0n;
    case "gt_s": return s > 0n;
    case "le_s": return s <= 0n;
    case "ge_s": return s >= 0n;
    case "lt_u": return false;
    case "gt_u": return x != 0n;
    case "le_u": return x == 0n;
    case "ge_u": return true;
  }
}

function floatCompare(op, x) {
  switch (op) {
    case "eq": return x == 0;
    case "ne": return x != 0;
    case "lt": return x < 0;
    case "gt": return x > 0;
    case "le": return x <= 0;
    case "ge": return x >= 0;
  }
}

// x OP y is y SWAPPED(OP) x.
const swapped = {
  eq: "eq", ne: "ne",
  lt_s: "gt_s", gt_s: "lt_s", le_s: "ge_s", ge_s: "le_s",
  lt_u: "gt_u", gt_u: "lt_u", le_u: "ge_u", ge_u: "le_u",
  lt: "gt", gt: "lt", le: "ge", ge: "le",
};

const zero = "(v128.const i64x2 0 0)";
const input = "(v128.load (i32.const 0))";

for (const [shape, size, ops] of ints.concat(floats)) {
  const isFloat = shape[0] == "f";
  for (const op of ops) {
    const ins = wasmEvalText(`(module (memory (export "mem") 1)
      (func (export "rhs")
        (v128.store (i32.const 16) (${shape}.${op} ${input} ${zero})))
      (func (export "lhs")
        (v128.store (i32.const 16) (${shape}.${op} ${zero} ${input})))
      (func (export "shared") (local v128)
        (local.set 0 ${zero})
        (v128.store (i32.const 16) (${shape}.${op} ${input} (local.get 0)))
        (v128.store (i32.const 32) (local.get 0))))`);
    const mem = new Uint8Array(ins.exports.mem.buffer);
    for (const lanes of laneGroups(size, isFloat)) {
      const compare = o => lanes.map(x => isFloat ? floatCompare(o, x) : intCompare(o, size, x));
      const want = compare(op);
      writeLanes(mem, 0, size, lanes, isFloat);
      ins.exports.rhs();
      assertSame(readMask(mem, 16, size), want);
      ins.exports.lhs();
      assertSame(readMask(mem, 16, size), compare(swapped[op]));
      mem.fill(0xff, 32, 48);
      ins.exports.shared();
      assertSame(readMask(mem, 16, size), want);
      assertSame(Array.from(mem.subarray(32, 48)), iota(16).map(() => 0));
    }
  }
}

for (const [shape, size, ops] of ints.concat(floats)) {
  const isFloat = shape[0] == "f";
  const constant = isFloat
    ? `(v128.const ${shape} ${Array(16 / size).fill("-1.5").join(" ")})`
    : "(v128.const i32x4 0x80000001 0x7ffffffe 0 0xffffffff)";
  for (const op of ops) {
    const ins = wasmEvalText(`(module (memory (export "mem") 1)
      (func (export "init") (v128.store (i32.const 48) ${constant}))
      (func (export "constant")
        (v128.store (i32.const 16) (${shape}.${op} ${input} ${constant})))
      (func (export "register")
        (v128.store (i32.const 32)
          (${shape}.${op} ${input} (v128.load (i32.const 48)))))
      (func (export "constantLhs")
        (v128.store (i32.const 16) (${shape}.${op} ${constant} ${input})))
      (func (export "registerLhs")
        (v128.store (i32.const 32)
          (${shape}.${op} (v128.load (i32.const 48)) ${input}))))`);
    const mem = new Uint8Array(ins.exports.mem.buffer);
    ins.exports.init();
    for (const lanes of laneGroups(size, isFloat)) {
      writeLanes(mem, 0, size, lanes, isFloat);
      ins.exports.constant();
      ins.exports.register();
      assertSame(readMask(mem, 16, size), readMask(mem, 32, size));
      ins.exports.constantLhs();
      ins.exports.registerLhs();
      assertSame(readMask(mem, 16, size), readMask(mem, 32, size));
    }
  }
}
