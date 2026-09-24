// |jit-test| --ion-limit-script-size=off

setJitCompilerOption("baseline.warmup.trigger", 9);
setJitCompilerOption("ion.warmup.trigger", 20);

// Prevent GC from cancelling/discarding Ion compilations.
gczeal(0);

var max = 200;

// Check that we are able to remove the operation inside recover test functions
// (denoted by "rop..."), when we inline the first version of uceFault, and
// ensure that the bailout is correct when uceFault is replaced (which cause an
// invalidation bailout).

var uceFault = function (i) {
  if (i > 98) {
    uceFault = function (i) { return true; };
  }
  return false;
};

let u32 = new Uint32Array(100);

for (let i = 0; i < u32.length; ++i) {
  u32[i] = 0x8000_0000 + i;
}

let uceFault_runsignedtodouble_atomics_and = eval(`(${uceFault})`.replace('uceFault', 'uceFault_runsignedtodouble_atomics_and'));
function runsignedtodouble_atomics_and(i) {
  var y = Atomics.and(u32, i, -1);
  if (uceFault_runsignedtodouble_atomics_and(i) || uceFault_runsignedtodouble_atomics_and(i))
    assertEq(y, 0x8000_0063);
  assertRecoveredOnBailout(y, true);
  return i;
}

let uceFault_runsignedtodouble_atomics_cmpxchg = eval(`(${uceFault})`.replace('uceFault', 'uceFault_runsignedtodouble_atomics_cmpxchg'));
function runsignedtodouble_atomics_cmpxchg(i) {
  var y = Atomics.compareExchange(u32, i, -1, 0);
  if (uceFault_runsignedtodouble_atomics_cmpxchg(i) || uceFault_runsignedtodouble_atomics_cmpxchg(i))
    assertEq(y, 0x8000_0063);
  assertRecoveredOnBailout(y, true);
  return i;
}

let uceFault_runsignedtodouble_atomics_xchg = eval(`(${uceFault})`.replace('uceFault', 'uceFault_runsignedtodouble_atomics_xchg'));
function runsignedtodouble_atomics_xchg(i) {
  var y = Atomics.exchange(u32, i, -1);
  if (uceFault_runsignedtodouble_atomics_xchg(i) || uceFault_runsignedtodouble_atomics_xchg(i))
    assertEq(y, 0x8000_0063);
  assertRecoveredOnBailout(y, true);
  return i;
}

for (let j = 100 - max; j < 100; j++) {
  with({}){} // Do not Ion-compile this loop.
  let i = j < 2 ? (Math.abs(j) % 50) + 2 : j;

  runsignedtodouble_atomics_and(i);
  runsignedtodouble_atomics_cmpxchg(i);
  runsignedtodouble_atomics_xchg(i);
}
