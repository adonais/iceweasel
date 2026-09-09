// |jit-test| --fast-warmup; --no-threads

// Bail out of an Ion frame that is still mid-generator-resume, so the resume
// has to be redone in Baseline.
//
// LICM hoists the guards for |a.p| and |a.q| into the loop's resume merge
// block.

var sink = null;

function* g(o, n) {
  let a = o;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    yield acc;
    sink = a.p + a.q;
    acc += i;
  }
  return acc;
}

function drive(o, n) {
  let seen = [];
  for (const v of g(o, n)) {
    seen.push(v);
  }
  return seen.join(",");
}

const expected = "0,0,1,3,6";

for (let k = 0; k < 500; k++) {
  assertEq(drive({p: 1, q: 2}, 5), expected);
}

const shapes = [
  {p: 1, q: 2},
  {p: 1, q: 2, extra: 3},
  {q: 2, p: 1},
  {p: 1.5, q: 2.5},
  {p: "a", q: "b"},
];
for (let k = 0; k < 200; k++) {
  for (const o of shapes) {
    assertEq(drive(o, 5), expected);
  }
}
