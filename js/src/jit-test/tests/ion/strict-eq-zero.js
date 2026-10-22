// |jit-test| --fast-warmup

var values = [
  0, -0, 1, -1, 0.5, NaN, Infinity, -Infinity, Number.MIN_VALUE,
  -Number.MIN_VALUE, -Number.MAX_VALUE, "0", "", false, true, null, undefined,
  {}, [], 0n, Symbol(),
];

function eqSet(x) {
  return x === 0;
}
function neSet(x) {
  return x !== 0;
}
function eqBranch(x) {
  if (x === 0) {
    return 1;
  }
  return 2;
}
function neBranch(x) {
  if (x !== 0) {
    return 1;
  }
  return 2;
}

for (var i = 0; i < 200; i++) {
  for (var v of values) {
    var isZero = typeof v === "number" && v == 0;
    assertEq(eqSet(v), isZero);
    assertEq(neSet(v), !isZero);
    assertEq(eqBranch(v), isZero ? 1 : 2);
    assertEq(neBranch(v), isZero ? 2 : 1);
  }
}
