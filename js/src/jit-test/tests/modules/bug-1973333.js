function f(x) {
  function g() {
    Array.from(arguments).sort(stackTest);
  }
  g.keepFailing = "object";
  var y = parseModule("");
  (function () {
    moduleLoadAndLink(y);
    moduleLoadAndLink(y);
  })();
  g(x, g);
}
f(f);

