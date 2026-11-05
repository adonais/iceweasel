// |jit-test| --no-ion; --no-baseline; --no-blinterp; skip-if: !hasFunction.gczeal || !hasFunction.oomAtAllocation
// Gray unmarking can run out of memory after a zone has finished marking in an
// incremental GC. Finishing that GC must not make the incomplete graph valid.

gczeal(0);

(function() {
  const root = grayRoot();
  const child = {deep: {x: 123}};
  root[0] = child;
  addMarkObservers([root, child, child.deep]);
})();
gc();
assertEq(grayBitsValid(), true);
assertEq(getMarks().join(","), "gray,gray,gray");

// Yield before sweeping objects, after this zone's marking has finished.
gczeal(21, 0);
startgc(1);
while (gcstate(this) !== "Sweep") {
  assertEq(gcstate(), "Sweep");
  gcslice(1);
}
assertEq(gcstate(), "Sweep");
assertEq(getMarks().join(","), "gray,gray,gray");

// Fail the first allocation of the gray unmarking stack. The root is marked
// black, but its children remain gray.
oomAtAllocation(1);
let exposed = grayRoot();
assertEq(resetOOMFailure(), true);
assertEq(grayBitsValid(), false);
assertEq(getMarks().join(","), "black,gray,gray");
finishgc();
assertEq(gcstate(), "NotActive");
assertEq(grayBitsValid(), false);
assertEq(getMarks().join(","), "black,gray,gray");

// A subsequent full GC must still be able to restore validity.
gczeal(0);
gc();
assertEq(grayBitsValid(), true);
assertEq(getMarks().join(","), "black,black,black");
