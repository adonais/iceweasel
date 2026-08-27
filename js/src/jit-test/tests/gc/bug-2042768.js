var z = newGlobal({newCompartment: true});
var ws = new z.WeakSet();
var s = Symbol();
grayRoot().push(s);
ws.add(s);
s = undefined;
gc();
gc(z);
