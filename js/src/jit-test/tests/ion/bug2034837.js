// |jit-test| --no-threads

// Pass the Ion-returned Symbol to a native (Object.is) to trigger cx->check.
function f(k) {
  return wm.get(k);
}
with ({}) {} // Don't Ion-compile.
let key = {};
let val = Symbol();
let wm = new WeakMap();
wm.set(key, val);
grayRoot()[0] = key;
key = val = undefined;
gc();
let r = grayRoot()[0];
for (let i = 0; i < 2000; i++) { // warm into Ion
  f({});
}
let sym = f(r);                  // Ion path: returns gray Symbol
Object.is(sym, sym);             // native call → cx->check(args[0])
