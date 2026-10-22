// |jit-test| skip-if: !wasmSimdEnabled()

// ne(and(a, b), 0) for every integer lane width, alone, with the zero on the
// left, with the and also used elsewhere, and with the zero shared.

const ints = [["i8x16", 1], ["i16x8", 2], ["i32x4", 4], ["i64x2", 8]];
const zero = "(v128.const i64x2 0 0)";

function readMask(mem, offset, size) {
  const out = [];
  for (let i = 0; i < 16 / size; i++) {
    const lane = Array.from(mem.subarray(offset + i * size, offset + (i + 1) * size));
    assertEq(lane.every(b => b == lane[0]) && (lane[0] == 0 || lane[0] == 0xff), true);
    out.push(lane[0] == 0xff);
  }
  return out;
}

for (const [shape, size] of ints) {
  const ins = wasmEvalText(`(module (memory (export "mem") 1)
    (func (export "test")
      (v128.store (i32.const 32)
        (${shape}.ne (v128.and (v128.load (i32.const 0)) (v128.load (i32.const 16)))
                     ${zero})))
    (func (export "zeroLeft")
      (v128.store (i32.const 32)
        (${shape}.ne ${zero}
                     (v128.and (v128.load (i32.const 0)) (v128.load (i32.const 16))))))
    (func (export "shared") (local v128)
      (local.set 0 (v128.and (v128.load (i32.const 0)) (v128.load (i32.const 16))))
      (v128.store (i32.const 32) (${shape}.ne (local.get 0) ${zero}))
      (v128.store (i32.const 48) (local.get 0)))
    (func (export "sharedZero") (local v128)
      (local.set 0 ${zero})
      (v128.store (i32.const 32)
        (${shape}.ne (v128.and (v128.load (i32.const 0)) (v128.load (i32.const 16)))
                     (local.get 0)))
      (v128.store (i32.const 48) (local.get 0))))`);
  const mem = new Uint8Array(ins.exports.mem.buffer);
  const a = iota(16).map(i => (i * 37 + 1) & 0xff);
  const b = iota(16).map(i => [0x00, 0x80, 0x01, 0xfe][i % 4]);
  const and = a.map((x, i) => x & b[i]);
  const want = [];
  for (let i = 0; i < 16 / size; i++) {
    want.push(and.slice(i * size, (i + 1) * size).some(x => x != 0));
  }
  for (const [name, stored] of [["test", null], ["zeroLeft", null], ["shared", and],
                                ["sharedZero", iota(16).map(() => 0)]]) {
    mem.set(a, 0);
    mem.set(b, 16);
    mem.fill(0xff, 48, 64);
    ins.exports[name]();
    assertSame(readMask(mem, 32, size), want);
    if (stored) {
      assertSame(Array.from(mem.subarray(48, 64)), stored);
    }
  }
}
