// Resuming a generator while its script has a pending Ion compile task, so
// that jitCodeRaw points to the lazy link stub.

// The inner loop is needed for the generator to be Warp-compileable.
function* gen(n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 4; j++) {
      s += i * j + 1;
    }
    yield s;
  }
  return s;
}

function expected(n) {
  let s = 0;
  let t = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 4; j++) {
      s += i * j + 1;
    }
    t += s;
  }
  return t;
}

let exp = expected(300);
for (let k = 0; k < 400; k++) {
  let total = 0;
  for (const v of gen(300)) {
    total += v;
  }
  assertEq(total, exp);
}
