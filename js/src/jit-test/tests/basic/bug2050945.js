// Edge cases for the integer fast path in js::NumberMod (bug 2050945).

function mod(a, b) {
  return a % b;
}

var cases = [
  // Zero remainder takes the sign of the dividend.
  [6, 3, 0],
  [-6, 3, -0],
  [6, -3, 0],
  [-6, -3, -0],
  [0, 5, 0],
  [-0, 5, -0],

  // x % -1 is always zero, with the sign of x.
  [2147483647, -1, 0],
  [-2147483648, -1, -0],
  [5, -1, 0],
  [-5, -1, -0],

  // Non-zero remainders carry the sign of the dividend.
  [7, 3, 1],
  [-7, 3, -1],
  [7, -3, 1],
  [-7, -3, -1],
  [-2147483648, 3, -2],
  [-2147483648, 2147483647, -1],

  // Out of the Int32 fast path: integer-valued but too large, falls back to
  // fmod. 2147483648 == INT32_MAX + 1.
  [2147483648, -1, 0],
  [-2147483648, -2147483648, -0],
  [2 ** 53 - 1, 3, 1],

  // Non-integer operands fall back to fmod.
  [9.5, -5, 4.5],
  [-9.5, 5, -4.5],

  // Non-finite operands.
  [Infinity, 3, NaN],
  [5, Infinity, 5],
  [NaN, 3, NaN],
  [5, NaN, NaN],
];

function test() {
  for (var i = 0; i < cases.length; i++) {
    var a = cases[i][0];
    var b = cases[i][1];
    var expected = cases[i][2];
    assertEq(mod(a, b), expected, `mod(${a}, ${b}) != ${expected}`);
  }

  // b == 0 always yields NaN regardless of the dividend.
  assertEq(mod(5, 0), NaN);
  assertEq(mod(-5, 0), NaN);
  assertEq(mod(0, 0), NaN);
  assertEq(mod(5, -0), NaN);
}

for (var iter = 0; iter < 200; iter++) {
  test();
}