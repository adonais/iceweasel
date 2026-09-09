// |jit-test| --fast-warmup; --no-threads

// yield* with the Throw and Return resume kinds + a hot delegation loop.

let innerClosed = 0;

function* innerGen(n) {
  try {
    for (let i = 0; i < n; i++) {
      yield i;
    }
    return "innerDone";
  } finally {
    innerClosed++;
  }
}
function* deleg(n) {
  return "outer:" + (yield* innerGen(n));
}

// The inner generator catches the thrown value and keeps going, so the
// delegation loop resumes it rather than closing it.
function* innerCatches(n) {
  for (let i = 0; i < n; i++) {
    try {
      yield i;
    } catch (e) {
      yield "caught:" + e;
    }
  }
  return "innerDone";
}
function* delegCatch(n) {
  return "outer:" + (yield* innerCatches(n));
}

// An iterator with no throw method: throwing into the delegation has to close it
// and report a TypeError.
function noThrowIterable(n) {
  let i = 0;
  return {
    [Symbol.iterator]() { return this; },
    next: () => (i < n ? { value: i++, done: false } : { value: "d", done: true }),
    return: v => { innerClosed++; return { value: v, done: true }; },
  };
}
function* delegNoThrow(n) {
  return "outer:" + (yield* noThrowIterable(n));
}

function drive(g) {
  let out = [], r;
  while (!(r = g.next()).done) {
    out.push(String(r.value));
  }
  out.push(String(r.value));
  return out.join(",");
}

// Run the delegations to completion first, so the loops are Ion-compiled and the
// Next resumes go through the resume dispatch.
for (let i = 0; i < 200; i++) {
  assertEq(drive(deleg(4)), "0,1,2,3,outer:innerDone");
  assertEq(drive(delegCatch(4)), "0,1,2,3,outer:innerDone");
  assertEq(drive(delegNoThrow(4)), "0,1,2,3,outer:d");
}

// Force a return while suspended inside the delegation: the inner generator is
// closed and the outer one finishes with the forced value.
innerClosed = 0;
for (let i = 0; i < 200; i++) {
  const g = deleg(4);
  assertEq(g.next().value, 0);
  assertEq(g.next().value, 1);
  const r = g.return("stop");
  assertEq(r.value, "stop");
  assertEq(r.done, true);
}
assertEq(innerClosed, 200);

// Throw into the delegation, caught by the inner generator.
for (let i = 0; i < 200; i++) {
  const g = delegCatch(4);
  assertEq(g.next().value, 0);
  assertEq(g.next().value, 1);
  const r = g.throw("boom");
  assertEq(r.value, "caught:boom");
  assertEq(r.done, false);
}

// Throw into the delegation, not caught: the inner generator is closed and the
// exception comes out of the outer one.
innerClosed = 0;
for (let i = 0; i < 200; i++) {
  const g = deleg(4);
  assertEq(g.next().value, 0);
  let caught = null;
  try {
    g.throw("boom");
  } catch (e) {
    caught = e;
  }
  assertEq(caught, "boom");
  assertEq(g.next().done, true);
}
assertEq(innerClosed, 200);

// Throw into a delegation whose iterator has no throw method.
innerClosed = 0;
for (let i = 0; i < 200; i++) {
  const g = delegNoThrow(4);
  assertEq(g.next().value, 0);
  let caught = null;
  try {
    g.throw("boom");
  } catch (e) {
    caught = e;
  }
  assertEq(caught instanceof TypeError, true);
}
assertEq(innerClosed, 200);
