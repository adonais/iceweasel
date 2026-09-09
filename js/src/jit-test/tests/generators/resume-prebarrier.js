// |jit-test| --fast-warmup; --no-threads

// Resuming drains the generator's stack storage. This test verifies
// the pre-barrier there.

function use(o, v) {
  return o.x + v;
}

function* gen() {
  return use({x: 1}, yield 1);
}

function drive() {
  let g = gen();
  g.next();
  return g.next(2).value;
}

// Suspend a generator whose saved expression stack holds an object that is
// reachable from nowhere else.
let watched = gen();
watched.next();

// Snapshot the heap, with that object in it as an element of the generator's
// stack storage array.
verifyprebarriers();

// Warm up.
for (let i = 0; i < 200; i++) {
  assertEq(drive(), 3);
}

// Resume into Ion.
assertEq(watched.next(2).value, 3);

// Re-trace: the object has to have been marked by the barrier.
verifyprebarriers();
