// |jit-test| skip-if: !('interruptRegexp' in this); exitstatus: 6

setJitCompilerOption("baseline.warmup.trigger", 0);
gczeal(0);
let count = 0;

setInterruptCallback(() => {
  count++;
  if (count < 4) {
    interruptIf(true);
  }
  return count % 2 == 0;
});

interruptRegexp(/(a).*?\1/, "a" + "b".repeat(1000) + "a");
