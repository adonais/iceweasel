// Int32 compares whose lhs was spilled across a call: the lhs may be a
// memory operand when the rhs is a constant.

function blackhole() {
  with (this) {}
  return 0;
}

function f(n) {
  var a = n + 1;
  var b = n + 2;
  var c = n + 3;
  var d = n + 4;
  var e = n + 5;
  var g = n + 6;
  var h = n + 7;
  var i = n + 8;
  var j = n + 9;
  var k = n + 10;
  var l = n + 11;
  var m = n + 12;
  var o = n + 13;
  var p = n + 14;
  var q = n + 15;
  var t = (n & 1) !== 0;

  // Spill everything across the call.
  blackhole();

  var r = 0;
  // CompareAndBranch with constant rhs, both branch polarities.
  if (a == 8) {
    r += 1;
  }
  if (b != 8) {
    r += 2;
  } else {
    r += 4;
  }
  if (c < 8) {
    r += 8;
  }
  if (d <= 8) {
    r += 16;
  }
  if (e > 8) {
    r += 32;
  }
  if (g >= 8) {
    r += 64;
  }
  // TestIAndBranch on an int32 and on a boolean.
  if (h - 8) {
    r += 128;
  }
  if (t) {
    r += 256;
  }
  // Materialized LCompare results.
  r += (i == 8) ? 512 : 0;
  r += (j < 100) ? 1024 : 0;
  // Keep the rest alive past the compares.
  return r + k + l + m + o + p + q;
}

var expected = [];
for (var n = 0; n < 20; n++) {
  var a = n + 1, b = n + 2, c = n + 3, d = n + 4, e = n + 5, g = n + 6;
  var h = n + 7, i = n + 8, j = n + 9;
  var r = 0;
  if (a == 8) r += 1;
  if (b != 8) r += 2; else r += 4;
  if (c < 8) r += 8;
  if (d <= 8) r += 16;
  if (e > 8) r += 32;
  if (g >= 8) r += 64;
  if (h - 8) r += 128;
  if ((n & 1) !== 0) r += 256;
  r += (i == 8) ? 512 : 0;
  r += (j < 100) ? 1024 : 0;
  expected.push(r + 6 * n + 75);
}

for (var iter = 0; iter < 2000; iter++) {
  for (var n = 0; n < 20; n++) {
    assertEq(f(n), expected[n]);
  }
}
