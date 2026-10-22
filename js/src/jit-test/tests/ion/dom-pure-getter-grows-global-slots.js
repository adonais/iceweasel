// |jit-test| --fast-warmup; --no-threads

var dom = new FakeDOMObject();
var last = -1;

function f(obj, n) {
  for (var i = 0; i < n; i++) {
    obj.pendingGlobalProperties;
    last = i;
  }
}

for (let i = 0; i < 50; i++) {
  f(dom, 100);
}
assertEq(last, 99);

dom.pendingGlobalProperties = 2000;
f(dom, 200);
assertEq(last, 199);
