// |jit-test| --fast-warmup
gczeal(0);
function f(p) {
  if (p) {
    return p.getter;
  }
}
function test() {
  // Create a typed array with an object fuse + a |getter| that's the
  // |subarray| builtin.
  let p = new Int8Array(1);
  Object.defineProperty(p, 'getter', {get: Int8Array.prototype.subarray});
  addObjectFuse(p);

  // Warm up an IC accessing the getter. The IC stub contains both:
  // - GuardObjectPropertyFuse
  // - GuardFuse (OptimizeTypedArraySpeciesFuse)
  for (let i = 0; i < 20; i++) {
    f(p);
  }

  // Pop OptimizeTypedArraySpeciesFuse.
  popAllFusesInRealm();

  // Start an incremental GC.
  p = null;
  gczeal("IncrementalMultipleSlices", 1);
  startgc(1);

  // Trigger off-thread Ion-compilation of |f|.
  for (let i = 0; i < 50; i++) {
    f(null);
    globalThis.arr = [i];
  }

  // Finish the GC and trigger linking of the Ion code.
  finishgc();
  for (let i = 0; i < 10; i++) {
    f(null);
  }
}
test();
