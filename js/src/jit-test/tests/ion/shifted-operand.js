// Int32 add, sub and bitwise ops whose operand is a constant shift.

const values = [
  0, 1, -1, 2, 7, 0x1234, -0x5678, 0x7fffffff, -0x80000000, 0x40000000,
  0x3fffffff, -0x40000001, 0x55555555, -0x2aaaaaab,
];

for (const op of ["+", "-", "&", "|", "^"]) {
  for (const shift of ["<<", ">>", ">>>"]) {
    for (const amount of [1, 13, 31, 32, 33]) {
      for (const shiftedRhs of [true, false]) {
        for (const truncate of [true, false]) {
          const shifted = `(x ${shift} ${amount})`;
          let expr = shiftedRhs ? `y ${op} ${shifted}` : `${shifted} ${op} y`;
          if (truncate) {
            expr = `(${expr}) | 0`;
          }
          const f = new Function("x", "y", `return ${expr};`);
          const ref = new Function("x", "y", `with ({}) {} return ${expr};`);
          for (let i = 0; i < 100; i++) {
            const x = values[i % 3];
            const y = values[(i + 1) % 3];
            assertEq(f(x, y), ref(x, y));
          }
          for (const x of values) {
            for (const y of values) {
              assertEq(f(x, y), ref(x, y));
            }
          }
        }
      }
    }
  }
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + s.charCodeAt(i)) | 0;
  }
  return h;
}
function hashRef(s) {
  with ({}) {}
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + s.charCodeAt(i)) | 0;
  }
  return h;
}
for (let i = 0; i < 200; i++) {
  const s = "shifted operand " + i;
  assertEq(hash(s), hashRef(s));
}

function twoShifts(x, y) {
  return ((x << 3) + (y >>> 5)) | 0;
}
function sameShift(x) {
  const t = x << 7;
  return t ^ t;
}
function shiftUsedTwice(x, y) {
  const t = x >> 4;
  return ((y + t) | 0) - t;
}
for (let i = 0; i < 200; i++) {
  const x = values[i % values.length];
  const y = values[(i * 7) % values.length];
  assertEq(twoShifts(x, y), ((x * 8) + Math.floor((y >>> 0) / 32)) | 0);
  assertEq(sameShift(x), 0);
  assertEq(shiftUsedTwice(x, y), ((y + (x >> 4)) | 0) - (x >> 4));
}
