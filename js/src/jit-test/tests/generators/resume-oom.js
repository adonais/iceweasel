// |jit-test| --fast-warmup; --no-threads; allow-oom

// Throw from an Ion frame that is still mid-generator-resume.
// LICM hoists an MBigIntAdd instruction that throws an OOM exception.

var sink = null;

// Big enough that adding |big| to itself mallocs a digit array.
const big = (1n << 100000n) - 1n;

function* g(a, n) {
  let acc = 0;
  try {
    for (let i = 0; i < n; i++) {
      yield acc;
      sink = a + a;
      acc += i;
    }
  } catch (e) {}
  return acc;
}

function drive(a, n) {
  let count = 0;
  for (const v of g(a, n)) {
    count++;
  }
  return count;
}
for (let k = 0; k < 300; k++) {
  assertEq(drive(big, 5), 5);
}

for (let n = 1; n <= 40; n++) {
  const it = g(big, 5);
  it.next();
  oomAtAllocation(n);
  try {
    it.next();
    it.next();
  } catch {
  } finally {
    resetOOMFailure();
  }
}
