// Tests for JS::EnableRecordingAllocations testing functions.

load(libdir + "asserts.js");

function countClass(entries, className) {
  return entries.filter(e => e.className === className).length;
}

startRecordingAllocations();
var keep = [];
for (var i = 0; i < 10; i++) {
  keep.push({});
  keep.push([]);
  keep.push(new Map());
  keep.push(new Uint8Array(4));
}
var entries = stopRecordingAllocations();

assertEq(Array.isArray(entries), true);
assertEq(countClass(entries, "Object") >= 10, true);
assertEq(countClass(entries, "Array") >= 10, true);
assertEq(countClass(entries, "Map") >= 10, true);
assertEq(countClass(entries, "Uint8Array") >= 10, true);

for (var e of entries) {
  assertEq(typeof e.typeName, "string");
  assertEq(typeof e.className, "string");
  assertEq(e.coarseType, "Object");
  assertEq(typeof e.size, "number");
  assertEq(e.size > 0, true);
  assertEq(typeof e.inNursery, "boolean");
}

// Nothing is recorded after stopping.
assertThrowsInstanceOf(() => stopRecordingAllocations(), Error);

// Probability 0 records nothing.
startRecordingAllocations(0);
for (var i = 0; i < 10; i++) {
  keep.push({});
  keep.push(new Map());
}
assertEq(stopRecordingAllocations().length, 0);

// Invalid probabilities.
assertThrowsInstanceOf(() => startRecordingAllocations(-1), Error);
assertThrowsInstanceOf(() => startRecordingAllocations(2), Error);
assertThrowsInstanceOf(() => startRecordingAllocations(NaN), Error);

// Starting twice keeps a single log.
startRecordingAllocations();
keep.push(new Set());
startRecordingAllocations();
keep.push(new Set());
assertEq(countClass(stopRecordingAllocations(), "Set") >= 2, true);
