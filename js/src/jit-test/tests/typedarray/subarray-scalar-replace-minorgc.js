// Regression test for bug 2014365.

function test() {
  let r = [];
  for (let i = 0; i < 10; ++i) {
    for (let j = 0; j < 100; ++j) {
      const ta = new BigUint64Array(j);
      for (let k = 0; k < j; ++k) {
        // OOB load from scalar replaced subarray operation. Can trigger a minor
        // GC when allocating the result BigInt.
        const val = ta.subarray(1)[14];

        // Store the BigInt to avoid optimizing away the allocation.
        r[k & 1] = val;
      }
    }
  }

  // Read from |r| to avoid optimizing away the stores in the array.
  assertEq(r[0], 0n);
  assertEq(r[1], 0n);
}
test();
