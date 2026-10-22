function g() {}
function f(x, y, c) {
  var a = y + (x << 3);
  try {
    if (c) {
      g();
    }
  } catch (e) {}
  return x;
}
for (var i = 0; i < 5000; i++) {
  f(i, i + 1, (i & 1) == 0);
}
