// |jit-test| --enable-symbols-as-weakmap-keys

let other = newGlobal({newCompartment: true});
let s1 = Symbol();
let s2 = Symbol();
let wm = new WeakMap();
wm.set(s1, s2);
other.s = s1;
other.eval('grayRoot()[0] = s; s = undefined');
s1 = s2 = undefined;
gc();
let r = other.eval('grayRoot()[0]');
wm.get(r);
