// |jit-test| skip-if: !wasmSimdEnabled()

// replace_lane fed by extract_lane, for every lane size pairing, including the
// ones where the extracted value is sign- or zero-extended into the replaced
// lane, the ones reading from the vector being replaced into, an extracted
// value with several uses, and a replaced-into vector that stays live.

const extracts = [
  ["i8x16.extract_lane_s", 1, "i32", true],
  ["i8x16.extract_lane_u", 1, "i32", false],
  ["i16x8.extract_lane_s", 2, "i32", true],
  ["i16x8.extract_lane_u", 2, "i32", false],
  ["i32x4.extract_lane", 4, "i32", true],
  ["i64x2.extract_lane", 8, "i64", true],
];
const replaces = [
  ["i8x16.replace_lane", 1, "i32"],
  ["i16x8.replace_lane", 2, "i32"],
  ["i32x4.replace_lane", 4, "i32"],
  ["i64x2.replace_lane", 8, "i64"],
];

const src = iota(16).map(i => (0x80 + i * 17) & 0xff);
const dst = iota(16).map(i => (0x40 + i * 29) & 0xff);

function readLane(bytes, size, lane, signed) {
  if (size === 8) {
    let v = 0n;
    for (let i = 7; i >= 0; i--) {
      v = v * 256n + BigInt(bytes[lane * 8 + i]);
    }
    if (signed && v >= 0x8000000000000000n) {
      v -= 0x10000000000000000n;
    }
    return v;
  }
  let v = 0;
  for (let i = size - 1; i >= 0; i--) {
    v = v * 256 + bytes[lane * size + i];
  }
  if (signed && v >= 2 ** (8 * size - 1)) {
    v -= 2 ** (8 * size);
  }
  return v;
}

function expected(base, dstSize, dstLane, value) {
  const out = base.slice();
  const low = BigInt.asUintN(8 * dstSize, BigInt(value));
  for (let i = 0; i < dstSize; i++) {
    out[dstLane * dstSize + i] = Number((low >> BigInt(8 * i)) & 0xffn);
  }
  return out;
}

for (const [extract, srcSize, srcType, signed] of extracts) {
  for (const [replace, dstSize, dstType] of replaces) {
    if (srcType !== dstType) {
      continue;
    }
    const dstLanes = 16 / dstSize;
    const funcs = [];
    const cases = [];
    for (let s = 0; s < 16 / srcSize; s++) {
      for (let d = 0; d < dstLanes; d++) {
        for (const self of [false, true]) {
          const from = self ? "$v" : "$w";
          funcs.push(`
    (func (export "f${cases.length}") (local $v v128) (local $w v128)
      (local.set $v (v128.load (i32.const 0)))
      (local.set $w (v128.load (i32.const 16)))
      (v128.store (i32.const 32)
        (${replace} ${d} (local.get $v)
          (${extract} ${s} (local.get ${from})))))`);
          cases.push([s, d, self]);
        }
        const d2 = (d + 1) % dstLanes;
        funcs.push(`
    (func (export "g${s}_${d}") (local $l ${srcType})
      (v128.store (i32.const 32)
        (${replace} ${d2}
          (${replace} ${d} (v128.load (i32.const 0))
            (local.tee $l (${extract} ${s} (v128.load (i32.const 16)))))
          (local.get $l)))
      (${srcType}.store (i32.const 48) (local.get $l)))`);
        funcs.push(`
    (func (export "h${s}_${d}") (local $v v128)
      (local.set $v (v128.load (i32.const 0)))
      (v128.store (i32.const 32)
        (${replace} ${d} (local.get $v)
          (${extract} ${s} (v128.load (i32.const 16)))))
      (v128.store (i32.const 48) (local.get $v)))`);
      }
    }
    const ins = wasmEvalText(`(module (memory (export "mem") 1) ${funcs.join("")})`);
    const mem = new Uint8Array(ins.exports.mem.buffer);
    const view = new DataView(ins.exports.mem.buffer);
    cases.forEach(([s, d, self], i) => {
      mem.set(dst, 0);
      mem.set(src, 16);
      ins.exports["f" + i]();
      const value = readLane(self ? dst : src, srcSize, s, signed);
      assertSame(Array.from(mem.subarray(32, 48)),
                 expected(dst, dstSize, d, value));
    });
    for (let s = 0; s < 16 / srcSize; s++) {
      for (let d = 0; d < dstLanes; d++) {
        const d2 = (d + 1) % dstLanes;
        mem.set(dst, 0);
        mem.set(src, 16);
        ins.exports[`g${s}_${d}`]();
        const value = readLane(src, srcSize, s, signed);
        assertSame(Array.from(mem.subarray(32, 48)),
                   expected(expected(dst, dstSize, d, value), dstSize, d2,
                            value));
        if (srcType === "i64") {
          assertEq(view.getBigInt64(48, true), value);
        } else {
          assertEq(view.getInt32(48, true), value | 0);
        }

        mem.set(dst, 0);
        mem.set(src, 16);
        ins.exports[`h${s}_${d}`]();
        assertSame(Array.from(mem.subarray(32, 48)),
                   expected(dst, dstSize, d, value));
        assertSame(Array.from(mem.subarray(48, 64)), dst);
      }
    }
  }
}
