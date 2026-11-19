// Realms created while recording also record allocations.

startRecordingAllocations();
var g = newGlobal({newCompartment: true});
g.eval("var keep = []; for (var i = 0; i < 10; i++) { keep.push(new WeakMap()); }");
var entries = stopRecordingAllocations();
assertEq(entries.filter(e => e.className === "WeakMap").length >= 10, true);
