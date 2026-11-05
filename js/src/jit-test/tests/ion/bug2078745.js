// |jit-test| --ion-offthread-compile=off

function f(arr, c1, c2) {
  var d = c1 ? 1 : -0;
  var a = arr[d];
  var r = 0;
  if (c2) {
    r = d * 1;
  }
  return r;
}
var arr = [10, 20, 30];
for (var i = 0; i < 200; i++) {
  f(arr, false, false);
}
for (var i = 0; i < 2000; i++) {
  f(arr, true, true);
  f(arr, false, false);
}
var r = f(arr, false, true);
if (!Object.is(r, -0)) {
  throw new Error("expected -0, got " + (1 / r > 0 ? "+0" : r));
}
