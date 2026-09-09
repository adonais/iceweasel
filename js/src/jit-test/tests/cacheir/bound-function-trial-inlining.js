// |jit-test| --inlining-entry-threshold=1; --trial-inlining-warmup-threshold=50; --baseline-warmup-threshold=200; --ion-warmup-threshold=1000; --no-threads; --no-cgc; --baseline-batching=on

// Verify that calls to bound functions are actually trial-inlined, and that the
// cases we don't support are actually rejected.

let options = getJitCompilerOptions();
if (!options['blinterp.enable'] ||
    !options['baseline.enable'] ||
    options['ion.warmup.trigger'] <= 100) {
  print("Unsupported jit options");
  quit();
}

const obj = {tag: "obj"};

// The target's IC is made polymorphic below so that we get trial inlining
// instead of monomorphic inlining. See ShouldUseMonomorphicInlining.
function target(o) {
  return o.x;
}
const bound = target.bind(obj);

function caller(o) {
  return bound(o);
}

function testInlined() {
  with ({}) {}
  for (var i = 0; i < 50; i++) {
    assertEq(caller({x: 1}), 1);
    assertEq(caller({a: 0, x: 1}), 1);
  }
  let ICs = disblic(caller);
  if (/;   IR:/.test(ICs)) { // Only assert if we can actually dump IR.
    assertEq(/CallInlinedBoundFunction/.test(ICs), true);
  }
}
testInlined();

// Bound arguments are not supported yet: the stub must stay unchanged.
function target2(a, o) {
  return a + o.x;
}
const bound2 = target2.bind(obj, 1);

function caller2(o) {
  return bound2(o);
}

function testNotInlined() {
  with ({}) {}
  for (var i = 0; i < 50; i++) {
    assertEq(caller2({x: 1}), 2);
    assertEq(caller2({a: 0, x: 1}), 2);
  }
  let ICs = disblic(caller2);
  if (/;   IR:/.test(ICs)) {
    assertEq(/CallInlinedBoundFunction/.test(ICs), false);
    assertEq(/CallBoundScriptedFunction/.test(ICs), true);
  }
}
testNotInlined();
