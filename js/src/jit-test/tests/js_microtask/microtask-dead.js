// |jit-test|  --more-compartments; -P use_js_microtask_queue=true

var called = false;
// A dead wrapper in the job queue shouldn't crash.
newGlobal().Promise.resolve().then(() => {
  called = true;
});
nukeAllCCWs();

drainJobQueue();

// The job should be skipped.
assertEq(called, false);
