// |jit-test| --fast-warmup; --no-threads

function notNotInt(x) {
  return !!x;
}
function notNotString(s) {
  return !!s;
}
function notLt(a, b) {
  return !(a < b);
}
function notLe(a, b) {
  return !(a <= b);
}
function notGt(a, b) {
  return !(a > b);
}
function notGe(a, b) {
  return !(a >= b);
}
function notEq(a, b) {
  return !(a == b);
}
function notStrictNe(a, b) {
  return !(a !== b);
}
function notUnsignedLt(a, b) {
  return !((a >>> 0) < (b >>> 0));
}
function notBigInt64Lt(a, b) {
  return !(BigInt.asIntN(64, a) < BigInt.asIntN(64, b));
}
function notBool(a, b) {
  return !((a < b) === (b < a));
}

const ints = [0, 1, -1, 2, 7, -7, 0x7fffffff, -0x80000000];
const strings = ["", "a", "xyz"];
const bigints = [0n, 1n, -1n, 2n ** 63n - 1n, -(2n ** 63n)];

for (let i = 0; i < 200; i++) {
  for (const a of ints) {
    assertEq(notNotInt(a), a !== 0);
    for (const b of ints) {
      assertEq(notLt(a, b), a >= b);
      assertEq(notLe(a, b), a > b);
      assertEq(notGt(a, b), a <= b);
      assertEq(notGe(a, b), a < b);
      assertEq(notEq(a, b), a !== b);
      assertEq(notStrictNe(a, b), a === b);
      assertEq(notUnsignedLt(a, b), a >>> 0 >= b >>> 0);
      assertEq(notBool(a, b), (a < b) !== (b < a));
    }
  }
  for (const s of strings) {
    assertEq(notNotString(s), s.length !== 0);
  }
  for (const a of bigints) {
    for (const b of bigints) {
      assertEq(notBigInt64Lt(a, b), a >= b);
    }
  }
}
