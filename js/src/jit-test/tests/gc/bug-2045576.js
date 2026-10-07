gczeal(0);

setJitCompilerOption("ion.warmup.trigger", 30);
setJitCompilerOption("baseline.warmup.trigger", 10);
setJitCompilerOption("offthread-compilation.enable", 0);
gcPreserveCode();

let g = newGlobal({ newCompartment: true });
g.eval('var s = Symbol("t");');

function readJit(m, k) {
  globalThis.sink = m.get(k);
  return inIon();
}
let throwawayMap = new WeakMap();
let throwawayKey = {};
throwawayMap.set(throwawayKey, {});
for (let i = 0; i < 5000; i++) {
  readJit(throwawayMap, throwawayKey);
}

let key = {};
(function () {
  let wm = new WeakMap();
  wm.set(key, { wr: new WeakRef(g.s) });
  grayRoot()[0] = wm;
})();
clearKeptObjects();

schedulezone(this);
schedulezone('atoms');
gc('zone');

let ion = false;
for (let i = 0; i < 10000 && !ion; i++) {
  ion = readJit(throwawayMap, throwawayKey);
}

readJit(grayRoot()[0], key);
