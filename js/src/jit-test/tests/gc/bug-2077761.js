if (!this.enqueueMark) {
  quit(0);
}

gczeal(0);
gcparam("incrementalWeakMapMarkingEnabled", 0);
const destination = newGlobal({newCompartment: true});
let pair = transplantableObject();
let key = wrapWithProto(pair.object, null);
let map = new WeakMap([[key, {}]]);
const holder = new WeakMap([[pair, true]]);
gc();
enqueueMark("set-color-gray");
enqueueMark(map);
enqueueMark("trace-deferred");
enqueueMark("unset-color");
enqueueMark("yield");
map = key = pair = null;
gczeal("YieldWhileGrayMarking", 1000000);
schedulezone(globalThis);
startgc(1);
while (gcstate() !== "NotActive" && currentgc().queuePos < 5) {
  gcslice(100, {dontStart: true});
}
nondeterministicGetWeakMapKeys(holder)[0].transplant(destination);
finishgc();
