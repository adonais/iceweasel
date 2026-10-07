// |jit-test| --baseline-warmup-threshold=10; --ion-warmup-threshold=100

const BASE_PROPS = 26;
const SHAPES = 4;
const ITERS = 350;
const FINAL_K = 2;

function make(k) {
  function g(a, b, c) {}
  for (let i = 0; i < BASE_PROPS + k; i++) {
    g["x" + i] = i;
  }
  g.p = 13;
  g.r = 37;
  return g;
}

function makeObjectName(k) {
  const g = make(k);
  Object.defineProperty(g, "name", {
    value: {marker: 7},
    writable: true,
    configurable: true,
  });
  return g;
}

function f(o) {
  const x = o.p;
  Object.keys(o);
  const y = o.name;
  return x + y.marker;
}

for (let i = 0; i < ITERS; i++) {
  if ((i & 7) === 0) {
    f(makeObjectName(i % SHAPES));
  } else {
    f(make(i % SHAPES));
  }
}

print(f(make(FINAL_K)));
