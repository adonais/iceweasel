gczeal(0);
var buf;
var holder = {h: null};
function f(a, v, holder) {
  var x = a[0];        // hole-load IC: creates the MElements node
  holder.h = {p: v};   // escaping inline allocation: minor-GC safepoint
  a[0] = v;            // hole-store: reuses the CSE'd MElements node
  return x;
}
function main() {
  with ({}) {}  // keep main out of Ion so f is compiled independently
  buf = serialize(new Array(100));
  gcparam('minNurseryBytes', 1024*1024);
  gcparam('maxNurseryBytes', 1024*1024);
  gc();
  // Train: hole-load (initLength 0) and append-store (0 == initLength)
  // attach LoadDenseElementHole / StoreDenseElementHole on fresh victims.
  for (var i = 0; i < 3000; i++) {
    var t = deserialize(buf);
    f(t, i, holder);
  }
  for (var i = 0; i < 400000; i++) {
    var pad = "x".repeat(32 + 8 * (i % 251));  // 8-byte alignment phase sweep
    var a = deserialize(buf);
    f(a, 7, holder);
    if (a[0] !== 7) {
      // Stale store went OOB instead of updating the (moved) array.
      quit(3);
    }
  }
}
main();
