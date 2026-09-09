// |jit-test| --fast-warmup; --no-threads

// Generators and async functions that need an arguments object.

function* gSum() {
  let s = 0;
  for (let i = 0; i < arguments.length; i++) {
    s += arguments[i];
    yield s;
  }
  return s;
}

// arguments live across a suspend in a nested loop.
function* gNested(n) {
  let s = 0;
  for (let i = 0; i < arguments.length; i++) {
    for (let j = 0; j < n; j++) {
      s += arguments[i] + j;
      yield s;
    }
  }
  return s;
}

// arguments delegated through yield*.
function* delegInner(a) {
  for (let i = 0; i < a.length; i++) {
    yield a[i];
  }
  return "end";
}
function* gYieldStar() {
  yield* delegInner(arguments);
  return arguments.length;
}

// Mapped arguments in sloppy mode mutating a formal.
function* gMapped(a, b) {
  let capture = () => arguments;
  let s = 0;
  for (let i = 0; i < 3; i++) {
    a += 1;
    s += capture()[0] + capture().length;
    yield s;
  }
  return s;
}

// The restored object must be the one the fresh-call prologue created.
function* gIdentity(a) {
  const saved = arguments;
  yield "x";
  return saved === arguments;
}

function drive(g) {
  let out = [], r;
  while (!(r = g.next()).done) {
    out.push(String(r.value));
  }
  out.push(String(r.value));
  return out.join(",");
}

const cases = [
  ["sum", () => gSum(1, 2, 3, 4), "1,3,6,10,10"],
  ["nested", () => gNested(2, 10, 20), "2,5,15,26,46,67,67"],
  ["yieldStar", () => gYieldStar(5, 6, 7), "5,6,7,3"],
  ["mapped", () => gMapped(10, 20), "13,27,42,42"],
  ["identity", () => gIdentity(1), "x,true"],
];

for (let i = 0; i < 200; i++) {
  for (const [name, mk, expected] of cases) {
    assertEq(drive(mk()), expected, name);
  }
}

// Async function using arguments across an await.
async function aSum() {
  let s = 0;
  for (let i = 0; i < arguments.length; i++) {
    s += await arguments[i];
  }
  return s;
}

let asyncFailure = null;
(async function () {
  for (let i = 0; i < 200; i++) {
    assertEq(await aSum(1, 2, 3, 4), 10);
  }
})().catch(e => { asyncFailure = e; });

drainJobQueue();
assertEq(asyncFailure, null);
