// |jit-test| --no-threads

gczeal(0);
setMarkStackLimit(2);
const skipped = newGlobal({newCompartment: true});
skipped.eval(`
  (() => {
    const key = Symbol();
    grayRoot().key = key;
    blackRoot().map = new WeakMap([[key, {}]]);
  })();
`);
gc();
gcslice(88);
abortgc();
schedulezone("atoms");
gc("zone");
skipped.eval("grayRoot().key");
