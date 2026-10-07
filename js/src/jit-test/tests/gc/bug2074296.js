// |jit-test| --no-ggc
(function () {
  var f = eval("(function g(x) { return x < 1 ? 0 : g(x - 1) + g(x - 2); })");
  f(5);
})();
gczeal(22, 1);
for (var i = 0; i < 2; i++) {
  var o = {};
}
