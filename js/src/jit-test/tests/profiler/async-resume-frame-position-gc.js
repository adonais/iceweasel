// |jit-test| skip-if: !getJitCompilerOptions()['blinterp.enable'] && !getJitCompilerOptions()['baseline.enable']
//
// Check that profiling stack frames captured during async resumption under
// nursery GC pressure have valid line/column information:
// ProfilingStackFrame::script() can still resolve tenured line/column data
// during a minor GC, since minor GC does not relocate scripts (bug 2044710).

setJitCompilerOption("baseline.warmup.trigger", 0);
setJitCompilerOption("ion.warmup.trigger", 1000);

const ITERATION_COUNT = 200;
const capturedStacks = [];

async function innerAsyncGc(i) {
  // Force nursery pressure to make minor GCs likely during resumption.
  let buf = [];
  for (let k = 0; k < 200; k++) {
    buf.push({ a: k, b: k * 2, c: "string-" + k });
  }
  await null;
  capturedStacks.push(readGeckoProfilingStack());
  return buf.length + i;
}

async function outerAsyncGc(count) {
  for (let i = 0; i < count; i++) {
    await innerAsyncGc(i);
  }
}

enableGeckoProfiling();
outerAsyncGc(ITERATION_COUNT);
drainJobQueue();
disableGeckoProfiling();

let nonEmptyStacks = 0;
let asyncFramesChecked = 0;
let asyncFramesWithBadPosition = 0;

for (const stack of capturedStacks) {
  if (stack.length > 0) {
    nonEmptyStacks++;
  }
  for (const physicalFrame of stack) {
    for (const frame of physicalFrame) {
      if (!frame.label) {
        continue;
      }
      if (
        !frame.label.includes("innerAsyncGc") &&
        !frame.label.includes("outerAsyncGc")
      ) {
        continue;
      }
      asyncFramesChecked++;
      // Skip the baseline-interpreter tier: readGeckoProfilingStack() reads
      // line/column from extractStack(), which only annotates baseline-jit and
      // ion frames.
      if (frame.kind === "baseline-interpreter") {
        continue;
      }
      const lineOk = typeof frame.line === "number" && frame.line > 0;
      const columnOk = typeof frame.column === "number" && frame.column > 0;
      if (!(lineOk && columnOk)) {
        print(
          `ERROR: ${frame.label} line=${frame.line} column=${frame.column} kind=${frame.kind}`
        );
        asyncFramesWithBadPosition++;
      }
    }
  }
}

assertEq(
  nonEmptyStacks > 0,
  true,
  "Expected at least one non-empty captured stack"
);
assertEq(
  asyncFramesChecked > 0,
  true,
  "Expected to observe frames for the async functions"
);
assertEq(
  asyncFramesWithBadPosition,
  0,
  "Every observed async frame should have a valid line/column"
);
