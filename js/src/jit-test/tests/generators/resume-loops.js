// |jit-test| --fast-warmup; --no-threads

function* plain(n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += i;
    yield s;
  }
  return s;
}

function* nested(n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      s += i * j;
      yield s;
    }
  }
  return s;
}

function* triple(n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    yield "a" + s;
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        s += i + j + k;
        yield "b" + s;
      }
      yield "c" + s;
    }
  }
  return "d" + s;
}

function* deepSingle(n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        s += i + j + k;
        yield s;
      }
    }
  }
  return s;
}

function* forIn(o) {
  let s = "";
  for (const k in o) {
    s += k;
    yield s;
  }
  return s;
}

function* inner(a) {
  for (const v of a) {
    yield "i" + v;
  }
  return "iend";
}
function* deleg(a) {
  const r = yield* inner(a);
  yield "d" + r;
  return "dend";
}

function* carried(n) {
  let acc = [];
  for (let i = 0; i < n; i++) {
    acc.push(i);
    yield acc.join("-");
  }
  return acc.join("-");
}

function alwaysThrows() {
  throw "boom";
}

// A loop that's only reachable through a catch-block WarpBuilder doesn't
// compile.
function* loopAfterCatch(n) {
  try {
    alwaysThrows();
    return "unreached";
  } catch (e) {}
  let s = "";
  for (let i = 0; i < n; i++) {
    s += i;
    yield s;
  }
  return s + "|end";
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
  ["plain", () => plain(4), "0,1,3,6,6"],
  ["nested", () => nested(3), "0,0,0,0,1,3,3,5,9,9"],
  ["triple", () => triple(2),
   "a0,b0,b1,c1,b2,b4,c4,a4,b5,b7,c7,b9,b12,c12,d12"],
  ["deepSingle", () => deepSingle(3),
   "0,1,3,4,6,9,11,14,18,19,21,24,26,29,33,36,40,45,47,50,54,57,61,66,70," +
   "75,81,81"],
  ["forIn", () => forIn({ a: 1, b: 2, c: 3 }), "a,ab,abc,abc"],
  ["deleg", () => deleg([7, 8]), "i7,i8,diend,dend"],
  ["carried", () => carried(4), "0,0-1,0-1-2,0-1-2-3,0-1-2-3"],
  ["loopAfterCatch", () => loopAfterCatch(3), "0,01,012,012|end"],
];

for (let i = 0; i < 200; i++) {
  for (const [name, mk, expected] of cases) {
    assertEq(drive(mk()), expected, name);
  }
}

function* manyIterations(n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += i;
    if (i === 0) {
      yield s;
    }
  }
  return s;
}
for (let i = 0; i < 200; i++) {
  const g = manyIterations(500);
  assertEq(g.next().value, 0);
  const r = g.next();
  assertEq(r.done, true);
  assertEq(r.value, 124750);
}
