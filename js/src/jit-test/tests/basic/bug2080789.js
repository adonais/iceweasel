// |jit-test| --emit-interpreter-entry; --baseline-eager

setJitCompilerOption("baseline.warmup.trigger", 1000);
setJitCompilerOption("blinterp.warmup.trigger", 1000);
oomTest(() => Function("return 42")());
