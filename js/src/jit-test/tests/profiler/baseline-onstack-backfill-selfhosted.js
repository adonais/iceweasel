// |jit-test| --no-ion; --setpref=experimental.self_hosted_cache=true; skip-if: !getJitCompilerOptions()['baseline.enable']
// experimental.self_hosted_cache makes self-hosted functions baseline-compile
// once into the atoms zone as realm-independent shared jitcode. Such code used
// to be registered eagerly at compile time; it is now registered lazily by the
// ToggleBaselineProfiling backfill, the same as ordinary baseline code. This
// test pins that the backfill recovers an on-stack shared self-hosted frame
// (here Array.prototype.map) when the profiler is enabled mid-execution.

setJitCompilerOption("baseline.warmup.trigger", 5);

let enableNow = false;
let captured = null;

function cb(x) {
  if (enableNow) {
    // Enable the profiler while the self-hosted `map` baseline frame is live on
    // the stack. Its shared jitcode survives ReleaseAllJITCode, and the backfill
    // must register an entry for it.
    enableGeckoProfiling();
    captured = readGeckoProfilingStack();
  }
  return x;
}

var arr = [1];
function run() {
  return arr.map(cb);
}

// Warm up to baseline with the profiler off, so `map` is compiled as shared
// self-hosted jitcode with no JitcodeGlobalTable entry.
for (var i = 0; i < 200; i++) {
  run();
}

enableNow = true;
run();
disableGeckoProfiling();

assertEq(Array.isArray(captured), true, "profiler should have been enabled");

let baselineLabels = [];
for (let physicalFrame of captured) {
  for (let frame of physicalFrame) {
    if (frame.kind === "baseline-jit") {
      baselineLabels.push(frame.label);
    }
  }
}

function hasFrame(re) {
  return baselineLabels.some(label => label && re.test(label));
}

assertEq(hasFrame(/map \(self-hosted/), true,
         "shared self-hosted map baseline-jit frame should be recovered by the " +
         "ToggleBaselineProfiling backfill");
