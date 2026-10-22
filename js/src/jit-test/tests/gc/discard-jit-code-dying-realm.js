// The JIT code of a realm that is hinted to be dying is not preserved.

// Skip this test if the Baseline JIT is disabled or if eager compilation is
// enabled.
if (inJit() !== false) {
  quit(0);
}

gczeal(0);
gcPreserveCode();

var g = newGlobal({sameZoneAs: this});
g.eval(`
function f() {
  return inJit();
}
function warmUp() {
  for (var i = 0; i < 200; i++) {
    f();
  }
}
function collect() {
  gc();
}
`);

g.warmUp();
assertEq(g.f(), true);

// We're preserving JIT code, so this keeps the code of the other realm.
gc();
assertEq(g.f(), true);

// Its JIT code is discarded when the realm is hinted to be dying.
g.setRealmIsDyingHint();
gc();
assertEq(g.f(), false);

// This also applies when the dying realm has frames on the stack.
g.warmUp();
assertEq(g.f(), true);
g.collect();
assertEq(g.f(), false);
