const g1 = newGlobal({ useWindowProxy: true, newCompartment: true });
const wp = g1.evaluate("this"); // CCW to g1's WindowProxy in our compartment
const wr = new WeakRef(wp);     // WeakRef registers on the unwrapped WindowProxy

// "Navigate": transplant the WindowProxy onto a fresh global.
newGlobal({ transplantWindowProxy: wp, newCompartment: true });

wp.x = 1;
assertEq(wp.x, 1);

assertEq(wr.deref() !== undefined, true);
