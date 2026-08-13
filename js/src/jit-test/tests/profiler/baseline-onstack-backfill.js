// |jit-test| --no-ion; skip-if: !getJitCompilerOptions()['baseline.enable']
// When the Gecko profiler is enabled while baseline jitcode is on the stack,
// ToggleBaselineProfiling must backfill JitcodeGlobalTable entries for the
// surviving baseline scripts. Baseline code compiled while the profiler was
// off has no entry (registration is skipped), so without the backfill the
// profiling frame iterator can't resolve those frames and they go missing
// from captured samples.

// Compile to baseline jit quickly. Ion is disabled (--no-ion) so the frames
// resolve as baseline-jit and aren't masked by Ion's always-registered entries.
setJitCompilerOption("baseline.warmup.trigger", 5);

let enableNow = false;

function inner() {
  if (enableNow) {
    // Turn the profiler on while the `outer` and `inner` baseline frames are
    // live on the stack, then immediately capture the stack.
    enableGeckoProfiling();
    return readGeckoProfilingStack();
  }
  return null;
}

function outer() {
  let stack = inner();
  return stack;
}

// Warm up with the profiler OFF so both functions are baseline-jit compiled
// and (with the optimization) have no JitcodeGlobalTable entry.
for (var i = 0; i < 500; i++) {
  outer();
}

enableNow = true;
let stack = outer();
disableGeckoProfiling();

assertEq(Array.isArray(stack), true, "profiler should have been enabled");

// Collect the labels of every baseline-jit frame in the captured stack.
let baselineLabels = [];
for (let physicalFrame of stack) {
  for (let frame of physicalFrame) {
    if (frame.kind === "baseline-jit") {
      baselineLabels.push(frame.label);
    }
  }
}

function hasFrame(name) {
  return baselineLabels.some(label => label && label.includes(name));
}

assertEq(hasFrame("outer"), true,
         "outer baseline-jit frame should be resolved in the profiler stack");
assertEq(hasFrame("inner"), true,
         "inner baseline-jit frame should be resolved in the profiler stack");
