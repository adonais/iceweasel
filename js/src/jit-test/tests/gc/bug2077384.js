// |jit-test| --fuzzing-safe; --no-threads

setJitCompilerOption("ion.warmup.trigger", 100);
setJitCompilerOption("baseline.warmup.trigger", 10);
setJitCompilerOption("offthread-compilation.enable", 0);

function foo(n) {
  const fresh = newGlobal({newCompartment: false, useWindowProxy: false});
  fresh.eval(`
  function probe(target, assigned, box) {
    let before = target.q599;
    let result = /variant/;
    target.q600 = assigned;
    box.before = before;
    box.result = result;
  }
  for (let index = 0; index < ${n}; index++) this["q" + index] = index;
  `);
  const box = {before: 0, result: null};
  fresh.probe(fresh, 1, box);
  fresh.enableTrackAllocations();
  for (let index = 0; index < 1000; index++) {
    fresh.q599 = index & 1;
    fresh.probe(fresh, index, box);
  }
  fresh.enableShellAllocationMetadataBuilder();
  fresh.probe(fresh, 12345, box);
  assertEq(fresh.q600, 12345);
}

for (var i = 150; i < 200; i++) {
  foo(i);
}
