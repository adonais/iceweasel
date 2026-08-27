// Check the integer fast path for the double remainder operator against
// results computed before anything is jitted.

// The two 32-bit halves are compared separately rather than combined into a
// double, which couldn't represent a 64-bit pattern exactly and would silently
// hide low-word differences. NaN is collapsed to a single token because neither
// its sign bit nor its payload is architecturally stable.
var f64 = new Float64Array(1);
var u32 = new Uint32Array(f64.buffer);
function bits(x) {
  if (Number.isNaN(x)) {
    return "NaN";
  }
  f64[0] = x;
  return `${(u32[1] >>> 0).toString(16)}:${(u32[0] >>> 0).toString(16)}`;
}

var values = [
  0, -0, 1, -1, 2, -2, 3, -3, 0.5, -0.5, 2.5, -2.5,
  1e7, -1e7, 12345678, -12345678,
  2147483647, -2147483648, -2147483649,  // INT32_MAX, INT32_MIN, INT32_MIN - 1
  4294967296, -4294967296,               // 2^32, -2^32
  9007199254740991, -9007199254740991,   // +/- (2^53 - 1), largest exact odd int
  9007199254740992, 9007199254740994,    // 2^53 and 2^53 + 2 (2^53 + 1 isn't exact)
  12345678901234, -12345678901234,
  9223372036854775808, -9223372036854775808,  // 2^63 and -2^63 (INT64_MIN)
  9223372036854774784, -9223372036854774784,  // largest double below 2^63
  1e19, -1e19, 1e30, -1e30,
  Infinity, -Infinity, NaN, Number.MIN_VALUE, Number.MAX_VALUE,
];

function mod(a, b) {
  return a % b;
}

// Constant divisors are lowered differently from variable ones, so exercise a
// handful of interesting ones. Each has its own function with a literal
// divisor (so the constant is visible to the JIT at the call site) and is
// checked on its own rather than folded together, so a mismatch points
// straight at the divisor that broke.
function modConst2p5(x) { return x % 2.5; }      // non-integer divisor
function modConst1e7(x) { return x % 1e7; }      // integer divisor
function modConst0(x) { return x % 0; }          // NaN result
function modConstM1(x) { return x % -1; }        // rejected -1 divisor
function modConstM0(x) { return x % -0; }        // -0 divisor, same as % 0
function modConst3(x) { return x % 3; }          // small integer divisor
function modConst1e30(x) { return x % 1e30; }    // out-of-range integer divisor
function modConstNaN(x) { return x % NaN; }      // NaN divisor
function modConstInf(x) { return x % Infinity; } // Infinity divisor

// Names are only used to make an assertion failure identify the divisor.
var constMods = [
  ["% 2.5", modConst2p5], ["% 1e7", modConst1e7], ["% 0", modConst0],
  ["% -1", modConstM1], ["% -0", modConstM0], ["% 3", modConst3],
  ["% 1e30", modConst1e30], ["% NaN", modConstNaN], ["% Infinity", modConstInf],
];

var expected = [];
for (var i = 0; i < values.length; i++) {
  for (var j = 0; j < values.length; j++) {
    expected.push(bits(values[i] % values[j]));
  }
  for (var c = 0; c < constMods.length; c++) {
    expected.push(bits(constMods[c][1](values[i])));
  }
}

for (var iter = 0; iter < 60; iter++) {
  var k = 0;
  for (var i = 0; i < values.length; i++) {
    for (var j = 0; j < values.length; j++) {
      assertEq(bits(mod(values[i], values[j])), expected[k++],
               `${values[i]} % ${values[j]}`);
    }
    for (var c = 0; c < constMods.length; c++) {
      assertEq(bits(constMods[c][1](values[i])), expected[k++],
               `${values[i]} ${constMods[c][0]}`);
    }
  }
}
