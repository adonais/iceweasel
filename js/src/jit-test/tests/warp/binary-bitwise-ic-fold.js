// |jit-test| --fast-warmup

function bitAnd(x) {
  return x & 0xffff;
}

function testBitAnd() {
  for (var i = 0; i < 1000; i++) {
    assertEq(bitAnd(2), 2);
    assertEq(bitAnd(i), i);

    if (i === 10) {
      // Call with non-Int32 value to ensure Baseline IC sees different types.
      assertEq(bitAnd(undefined), 0);
    }
  }
}
testBitAnd();

function bitOr(x) {
  return x | 1;
}

function testBitOr() {
  for (var i = 0; i < 1000; i++) {
    assertEq(bitOr(2), 3);
    assertEq(bitOr(i), i | 1);

    if (i === 10) {
      // Call with non-Int32 value to ensure Baseline IC sees different types.
      assertEq(bitOr(undefined), 1);
    }
  }
}
testBitOr();

function bitXor(x) {
  return x ^ 1;
}

function testBitXor() {
  for (var i = 0; i < 1000; i++) {
    assertEq(bitXor(3), 2);
    assertEq(bitXor(i), i ^ 1);

    if (i === 10) {
      // Call with non-Int32 value to ensure Baseline IC sees different types.
      assertEq(bitXor(undefined), 1);
    }
  }
}
testBitXor();

function lsh(x) {
  return x << 2;
}

function testLsh() {
  for (var i = 0; i < 1000; i++) {
    assertEq(lsh(3), 12);
    assertEq(lsh(i), i << 2);

    if (i === 10) {
      // Call with non-Int32 value to ensure Baseline IC sees different types.
      assertEq(lsh(undefined), 0);
    }
  }
}
testLsh();

function rsh(x) {
  return x >> 1;
}

function testRsh() {
  for (var i = 0; i < 1000; i++) {
    assertEq(rsh(3), 1);
    assertEq(rsh(i), i >> 1);

    if (i === 10) {
      // Call with non-Int32 value to ensure Baseline IC sees different types.
      assertEq(rsh(undefined), 0);
    }
  }
}
testRsh();
