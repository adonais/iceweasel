// |jit-test| --disable-main-thread-denormals; skip-if: !getBuildConfiguration("can-disable-main-thread-denormals")

// A denormal built from raw bits survives here even though a denormal literal
// would not.
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
function fromBits(hi, lo) {
  u32[0] = lo >>> 0;
  u32[1] = hi >>> 0;
  return f64[0];
}

const denormals = [
  fromBits(0, 1),                    // smallest positive denormal
  fromBits(0x80000000, 1),           // smallest negative denormal
  fromBits(0x000fffff, 0xffffffff),  // largest positive denormal
  fromBits(0x00080000, 0),
  fromBits(0, 0x80000000),
];

// Any NaN produced by a Math operation must be the canonical NaN.
//
// The canonical NaN bit pattern is hardware-determined, so read it off the
// engine's own NaN value instead of hardcoding it.
f64[0] = NaN;
const canonHi = u32[1] >>> 0;
const canonLo = u32[0] >>> 0;

function assertCanonicalIfNaN(r) {
  if (Number.isNaN(r)) {
    f64[0] = r;
    const hi = u32[1] >>> 0;
    const lo = u32[0] >>> 0;
    // A canonical NaN is allowed to have its sign bit set, so mask it off
    // before comparing (see Value::setDoubleAssumeCanonicalNaN).
    assertEq(hi & 0x7fffffff, canonHi & 0x7fffffff);
    assertEq(lo, canonLo);
  }
}

function test() {
  // An array with all unary Math functions. Skip sumPrecise because it requires
  // an iterable.
  const unary = Object.getOwnPropertyNames(Math).filter(name => {
    return typeof Math[name] === "function" && Math[name].length === 1 && name !== "sumPrecise";
  }).map(name => Math[name]);

  for (const fn of unary) {
    for (const x of denormals) {
      assertCanonicalIfNaN(fn(x));
    }
  }
  for (const fn of [Math.pow, Math.atan2, Math.hypot]) {
    for (const a of denormals) {
      for (const b of denormals) {
        assertCanonicalIfNaN(fn(a, b));
      }
    }
  }
  for (const arr of [denormals, [1, NaN, 2], [Infinity, -Infinity],
                     [1e308, 1e308, 1e308], []]) {
    assertCanonicalIfNaN(Math.sumPrecise(arr));
  }
}

// Run in a loop so the operations are also exercised after JIT compilation.
for (let i = 0; i < 100; i++) {
  test();
}
