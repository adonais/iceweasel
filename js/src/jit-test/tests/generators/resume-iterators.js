// |jit-test| --fast-warmup; --no-threads

function* forOf(a) {
  let s = 0;
  for (const v of a) {
    s += v;
    yield s;
  }
  return s;
}

// for-of over a custom iterator.
function* forOfCustom(n) {
  const iterable = {
    [Symbol.iterator]() {
      let i = 0;
      return { next: () => (i < n ? { value: i++, done: false }
                                  : { value: undefined, done: true }) };
    }
  };
  let s = 0;
  for (const v of iterable) {
    s += v;
    yield s;
  }
  return s;
}

// Nested iterator loops.
function* nestedForOf(a, b) {
  let s = "";
  for (const x of a) {
    for (const y of b) {
      s += x + y;
      yield s;
    }
  }
  return s;
}

// for-in nested inside for-of.
function* mixed(a, o) {
  let s = "";
  for (const v of a) {
    for (const k in o) {
      s += v + k;
      yield s;
    }
  }
  return s;
}

// Breaking out of a for-of runs the iterator close while suspended values are
// still live.
function* earlyBreak(a) {
  let s = 0;
  for (const v of a) {
    s += v;
    yield s;
    if (v >= 2) {
      break;
    }
  }
  return s;
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
  ["forOf", () => forOf([1, 2, 3]), "1,3,6,6"],
  ["forOfCustom", () => forOfCustom(3), "0,1,3,3"],
  ["nestedForOf", () => nestedForOf(["a", "b"], ["x", "y"]),
   "ax,axay,axaybx,axaybxby,axaybxby"],
  ["mixed", () => mixed(["p", "q"], { m: 1, n: 2 }),
   "pm,pmpn,pmpnqm,pmpnqmqn,pmpnqmqn"],
  ["earlyBreak", () => earlyBreak([1, 2, 3, 4]), "1,3,3"],
];

for (let i = 0; i < 200; i++) {
  for (const [name, mk, expected] of cases) {
    assertEq(drive(mk()), expected, name);
  }
}

// Abandoning a suspended for-of must still close the iterator.
let closed = 0;
function* closes(n) {
  const iterable = {
    [Symbol.iterator]() {
      let i = 0;
      return {
        next: () => (i < n ? { value: i++, done: false }
                           : { value: undefined, done: true }),
        return: () => { closed++; return { done: true }; },
      };
    }
  };
  for (const v of iterable) {
    yield v;
  }
}
for (let i = 0; i < 200; i++) {
  const g = closes(5);
  assertEq(g.next().value, 0);
  assertEq(g.next().value, 1);
  assertEq(g.return("stop").value, "stop");
}
assertEq(closed, 200);
