function test() {
  const ta = new TypedArray(1);
  const T = ta[0].constructor;
  const zero = T(0);
  const one = T(1);

  function cmpxchg_oldval(oldval) {
    // Set |oldval| to ensure we don't simply return the MParameter instruction.
    oldval = oldval | zero;

    // Perform the compare-exchange operation.
    Atomics.compareExchange(ta, 0, oldval, zero);

    // Return |oldval| to check LCompareExchangeTypedArrayElement didn't modify
    // the register value.
    return oldval;
  }

  function cmpxchg_newval(newval) {
    // Set |newval| to ensure we don't simply return the MParameter instruction.
    newval = newval | zero;

    // Perform the compare-exchange operation.
    Atomics.compareExchange(ta, 0, zero, newval);

    // Return |newval| to check LCompareExchangeTypedArrayElement didn't modify
    // the register value.
    return newval;
  }

  for (let i = 0; i < 2; ++i) {
    for (let k = 0; k <= 65; ++k) {
      let v = one << T(k);
      assertEq(cmpxchg_oldval(v), v | zero);
      assertEq(cmpxchg_newval(v), v | zero);
    }
  }
}

const TypedArrays = [
  Int8Array,
  Uint8Array,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  BigInt64Array,
  BigUint64Array,
];

for (let TA of TypedArrays) {
  let f = Function(`return ${test}`.replaceAll("TypedArray", TA.name))();
  f();
}
