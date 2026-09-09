// |jit-test| --fast-warmup; --no-threads

// Tests for an uninitialized-lexical in a frame slot.

// |y| holds the uninitialized-lexical magic across both suspends.
function* tdzLocal(x) {
  yield x;
  yield x + 1;
  let y = x * 2;
  return y;
}

// Several uninitialized locals, plus a live expression stack.
function* tdzManyLocals(x) {
  let a = x + (yield x);
  yield a;
  let b = a + 1;
  const c = b + 1;
  let d = c + 1;
  return d;
}

function drive(g, expected) {
  let out = [], r;
  while (!(r = g.next(1)).done) {
    out.push(String(r.value));
  }
  out.push(String(r.value));
  assertEq(out.join(","), expected);
}

for (let i = 0; i < 200; i++) {
  drive(tdzLocal(3), "3,4,6");
  drive(tdzManyLocals(5), "5,6,9");
}

// Reading the binding on the resume path, while it is still uninitialized,
// must throw.
function* tdzThrows(x) {
  yield x;
  y;
  let y = x;
}

for (let i = 0; i < 200; i++) {
  let g = tdzThrows(1);
  assertEq(g.next().value, 1);
  let caught = null;
  try {
    g.next();
  } catch (e) {
    caught = e;
  }
  assertEq(caught instanceof ReferenceError, true);
  assertEq(caught.message.includes("can't access lexical declaration"), true);
}
