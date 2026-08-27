// |jit-test| --no-threads
var sink = 0;
function f(a, b, x, v) {
  if (x === 0) return -1;
  var y = Math.fround(x);
  var j = Math.fround(y + 1);
  var r1 = a[j];
  b[y] = v;
  var r2 = a[j];
  sink = r1;
  return r2;
}
const N = 16777217;
const IDX = 16777216;
var arr = new Array(N).fill(1);
for (var it = 0; it < 5000; it++) {
  arr[IDX] = 41;
  var r = f(arr, arr, IDX, 42);
  assertEq(r, 42)
}
