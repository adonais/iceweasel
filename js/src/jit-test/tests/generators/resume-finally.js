// |jit-test| --fast-warmup; --no-threads

function* returnThroughFinally() {
  try {
    yield "t";
    return "tryReturn";
  } finally {
    yield "f";
  }
}

function* throwThroughFinally() {
  try {
    yield "t";
    throw "boom";
  } finally {
    yield "f";
  }
}

// Normal completion: the return value from the try survives the finally's yield.
for (let i = 0; i < 200; i++) {
  const g = returnThroughFinally();
  assertEq(g.next().value, "t");
  assertEq(g.next().value, "f");
  const r = g.next();
  assertEq(r.done, true);
  assertEq(r.value, "tryReturn");
}

// Forced return while suspended in the try: the finally still runs and suspends,
// and the forced value only comes out once it completes.
for (let i = 0; i < 200; i++) {
  const g = returnThroughFinally();
  assertEq(g.next().value, "t");
  const r = g.return("stop");
  assertEq(r.done, false);
  assertEq(r.value, "f");
  const r2 = g.next();
  assertEq(r2.done, true);
  assertEq(r2.value, "stop");
}

// A pending exception has to survive the suspend the same way.
for (let i = 0; i < 200; i++) {
  const g = throwThroughFinally();
  assertEq(g.next().value, "t");
  assertEq(g.next().value, "f");
  let caught = null;
  try {
    g.next();
  } catch (e) {
    caught = e;
  }
  assertEq(caught, "boom");
}
