// |jit-test| --no-threads; --fast-warmup
function f(x = (x, `${x}`)) {
  function inner() {
    x;
  }
}
for (var i = 0; i < 100; i++) {
  try {
    f();
  } catch (e) {}
}
