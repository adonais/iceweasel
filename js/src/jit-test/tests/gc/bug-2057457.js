gczeal(0);

for (a = 0; a < 25; a++) {
  gcslice(0);
}
let b = Symbol();
let c = newGlobal({newCompartment : true});
c.eval(b);
b = undefined;

gc("zone");

schedulezone(c);
schedulezone("");
gc("zone");

gc();
