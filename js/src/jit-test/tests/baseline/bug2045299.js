// |jit-test| --fuzzing-safe; --baseline-offthread-compile=on; --baseline-batching=on; --baseline-queue-capacity=8; --baseline-warmup-threshold=10
gczeal(14, 50);  // run a compacting GC every 50 allocations

function f(n) {
  if (n) {
    // Allocate enough to trigger a zeal-driven (DEBUG_GC) compacting GC while
    // this function's script is queued for off-thread baseline compilation
    // and its frame is live on the stack (so the GC's jit-code discard pass
    // cannot release the JitScript and dequeue the script first).
    for (var i = 0; i < 500; i++) {
      var o = { a: i };
    }
  }
  return n;
}

// Warm f up without allocating: after the warm-up threshold (10) is exceeded,
// the baseline interpreter's warm-up check enqueues f's script into the
// realm's BaselineCompileQueue (queue capacity 8, so no batch dispatch yet -
// the script stays queued).
for (var i = 0; i < 11; i++) {
  f(0);
}

// f's script now sits in the compile queue. Call it again so that it is on
// the stack when its allocations trigger the compacting GC.
f(1);
