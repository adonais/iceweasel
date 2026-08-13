// Test that Math.pow uses fdlibm and produces the same bit-exact result on
// every platform.
//
// Before Bug 2037094, Math.pow went through std::pow, which on Android API
// <= 28 ARM devices with unpatched OEM bionic returns 1.9275814160560204e-50
// for Math.pow(Math.PI, -100) — a 1-ULP-different result from the fdlibm
// value 1.9275814160560206e-50. Math.pow now unconditionally calls fdlibm_pow.

const FDLIBM_POW_PI_NEG_100 = 1.9275814160560206e-50;

assertEq(Math.pow(Math.PI, -100), FDLIBM_POW_PI_NEG_100);

// A few other inputs that hit the libm path (non-integer exponent, or an
// integer that overflows the integer-fast-path early). All must be bit-exact.
assertEq(Math.pow(2, 0.5), Math.SQRT2);
assertEq(Math.pow(10, 0.3010299956639812), 2);
assertEq(Math.pow(Math.E, 2), 7.3890560989306495);
assertEq(Math.pow(0.5, 100), 7.888609052210118e-31);

// Special-case paths must continue to work and return finite IEEE values.
assertEq(Math.pow(NaN, 0), 1);
assertEq(Math.pow(2, 0), 1);
assertEq(Math.pow(-0, 1), -0);
assertEq(Math.pow(4, 0.5), 2);   // sqrt fast-path
assertEq(Math.pow(4, -0.5), 0.5);
assertEq(Math.pow(2, Infinity), Infinity);
assertEq(Math.pow(1, Infinity), NaN);
assertEq(Math.pow(-1, -Infinity), NaN);

// Exercise hot paths so baseline + ion both compile pow, and accumulate the
// result over 1000 iterations so any per-call bit difference (across tiers or
// platforms) compounds into the sum and is caught. The expected value is the
// bit-exact accumulated sum; it is deliberately not 1000 * FDLIBM_POW_PI_NEG_100
// because floating-point summation rounds at each step.
function loop() {
  let acc = 0;
  for (let i = 0; i < 1000; i++) {
    acc += Math.pow(Math.PI, -100);
  }
  return acc;
}
assertEq(loop(), 1.9275814160560497e-47);

// Integer-exponent fast path (powi) is bit-deterministic — the integer fast
// path itself doesn't call libm at all for small n.
assertEq(Math.pow(3, 4), 81);
assertEq(Math.pow(2, 10), 1024);
assertEq(Math.pow(-2, 3), -8);
