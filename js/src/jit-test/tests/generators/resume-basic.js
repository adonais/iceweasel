// |jit-test| --fast-warmup; --no-threads

// Some simple generators.
function* gen(a, b) {
  let sum = a + b;
  yield sum;
  let doubled = sum * 2;
  yield doubled;
  let s = "" + a + b;
  return s + doubled;
}
function* exprStack(a) {
  return a + (yield a * 2) + (yield a * 3);
}
function* closure(a) {
  let box = { v: a };
  let bump = () => ++box.v;
  bump();
  yield box.v;
  bump();
  return box.v;
}

function drive(g, expected) {
  let out = [];
  let r;
  while (!(r = g.next(1)).done) {
    out.push(r.value);
  }
  out.push(r.value);
  assertEq(out.join("|"), expected);
}

for (let i = 0; i < 200; i++) {
  drive(gen(1, 2), "3|6|126");
  drive(exprStack(5), "10|15|7");
  drive(closure(7), "8|9");
}

// A yield inside a catch-block.
function* yieldInCatch(x, throwIt) {
  try {
    if (throwIt) {
      throw x;
    }
    yield x;
  } catch (e) {
    yield e + 1;
  }
  return x + 3;
}
for (let i = 0; i < 200; i++) {
  drive(yieldInCatch(10, false), "10|13");
}
for (let i = 0; i < 200; i++) {
  drive(yieldInCatch(10, true), "11|13");
}

// Throw and Return resume kinds.
for (let i = 0; i < 200; i++) {
  let g = gen(1, 2);
  g.next();
  let caught = null;
  try {
    g.throw("boom");
  } catch (e) {
    caught = e;
  }
  assertEq(caught, "boom");
  assertEq(g.next().done, true);

  let g2 = gen(1, 2);
  g2.next();
  let r = g2.return("early");
  assertEq(r.value, "early");
  assertEq(r.done, true);
}

async function asyncSum(a, b) {
  let x = await Promise.resolve(a);
  let y = await b;
  return x + y;
}

let asyncFailure = null;
(async function () {
  for (let i = 0; i < 200; i++) {
    assertEq(await asyncSum(3, 4), 7);
  }
})().catch(e => { asyncFailure = e; });

drainJobQueue();
assertEq(asyncFailure, null);
