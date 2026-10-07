// |jit-test| --fast-warmup
let a = new Uint8Array(10);
let o = {};
function f() {
  o.x = a.fill(0);
}
gc();
for (let i = 0; i < 500; i++) {
  f();
}
assertEq(o.x.length, 10);
