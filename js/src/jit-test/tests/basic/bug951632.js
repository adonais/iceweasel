enableTrackAllocations();
var g = newGlobal({newCompartment: true})
g.eval("function f(a) { return h(); }");
g.h = function () {
    return [1, 2, 3];
};
var o = getAllocationMetadata(g.f(5));
assertEq(o.functionDisplayName, "g.h");
