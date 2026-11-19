// |jit-test| error: ReferenceError
if (!('oomTest' in this))
    a;

enableTrackAllocations()
oomTest(() => {
  newGlobal()
})
gczeal(9, 1);
a;
