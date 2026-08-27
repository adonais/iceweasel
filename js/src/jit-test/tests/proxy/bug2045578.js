function assertEq(a,b) {
  if (a != b) throw "oops";
}

var target = {};
target[0] = 1;          // dense element: no shape property is created
Object.freeze(target);  // element 0 becomes non-writable, non-configurable

var proxy = new Proxy(target, {
  get(t, key) {
    return "evil";
  }
});

function read(o) {
  return o[0];
}

var throwCount = 0;

let N = 200;
for (var i = 0; i < N; i++) {
  try {
    forged = read(proxy);
    assertEq(true, false);
  } catch (e) {
    assertEq(e instanceof TypeError, true);
    throwCount++;
  }
}

assertEq(throwCount, N);
