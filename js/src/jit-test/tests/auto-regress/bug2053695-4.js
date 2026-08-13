function testCmpXchg8() {
  let i8 = new Int8Array(4);

  for (let i = 0; i < 100; ++i) {
    // Reset the first element.
    i8[0] = 0;

    // Set the first element to -1.
    Atomics.compareExchange(i8, 0, 0, -1);

    // Ensure only the first element was modified.
    assertEq(i8[0], -1);
    assertEq(i8[1], 0);
    assertEq(i8[2], 0);
    assertEq(i8[3], 0);
  }
}
testCmpXchg8();

function testCmpXchg16() {
  let i16 = new Int16Array(2);

  for (let i = 0; i < 100; ++i) {
    // Reset the first element.
    i16[0] = 0;

    // Set the first element to -1.
    Atomics.compareExchange(i16, 0, 0, -1);

    // Ensure only the first element was modified.
    assertEq(i16[0], -1);
    assertEq(i16[1], 0);
  }
}
testCmpXchg16();
