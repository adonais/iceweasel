// |jit-test| --fast-warmup; --no-threads

// Tests for various interesting resumeIndex dispatch cases.

function* siblings1(n) {
  let t = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      yield "a" + t++;
      yield "A" + t++;
    }
    yield "m" + t++;
    for (let k = 0; k < n; k++) {
      yield "b" + t++;
      yield "B" + t++;
    }
  }
  return "end" + t;
}

function* siblings2(n) {
  let t = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      yield "p" + t++;
      yield "P" + t++;
    }
    for (let k = 0; k < n; k++) {
      for (let l = 0; l < n; l++) {
        yield "q" + t++;
        yield "Q" + t++;
      }
    }
  }
  return "end" + t;
}

// One suspend, so the dispatch has a single entry and needs no index check.
async function oneEntry(x) {
  return "o" + (await Promise.resolve(x));
}

// InitialYield plus one yield: two entries dispatched with a compare.
function* twoEntries(x) {
  const a = yield x;
  return "t" + a;
}

// Four entries, which needs the jump table.
function* manyEntries(x) {
  const a = yield x;
  const b = yield x + 1;
  const c = yield x + 2;
  return "m" + a + b + c;
}

async function* asyncSiblings(n) {
  let t = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      yield "a" + (await t++);
    }
    yield "m" + (await t++);
    for (let k = 0; k < n; k++) {
      yield "b" + (await t++);
    }
  }
}

function drive(g) {
  let out = [], r, i = 0;
  while (!(r = g.next(i++)).done) {
    out.push(String(r.value));
  }
  out.push(String(r.value));
  return out.join(",");
}

const cases = [
  ["siblings1", () => siblings1(2),
   "a0,A1,a2,A3,m4,b5,B6,b7,B8,a9,A10,a11,A12,m13,b14,B15,b16,B17,end18"],
  ["siblings2", () => siblings2(2),
   "p0,P1,p2,P3,q4,Q5,q6,Q7,q8,Q9,q10,Q11,p12,P13,p14,P15,q16,Q17,q18,Q19," +
   "q20,Q21,q22,Q23,end24"],
  ["twoEntries", () => twoEntries(5), "5,t1"],
  ["manyEntries", () => manyEntries(5), "5,6,7,m123"],
];

for (let i = 0; i < 200; i++) {
  for (const [name, mk, expected] of cases) {
    assertEq(drive(mk()), expected, name);
  }
}

async function driveAsync(g) {
  let out = [], r;
  while (!(r = await g.next()).done) {
    out.push(String(r.value));
  }
  return out.join(",");
}

let asyncFailure = null;
(async function () {
  for (let i = 0; i < 200; i++) {
    assertEq(await driveAsync(asyncSiblings(2)),
             "a0,a1,m2,b3,b4,a5,a6,m7,b8,b9");
    assertEq(await oneEntry(5), "o5");
  }
})().catch(e => { asyncFailure = e; });

drainJobQueue();
assertEq(asyncFailure, null);
