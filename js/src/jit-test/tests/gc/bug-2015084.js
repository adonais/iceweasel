const size = 1000;
const iterations = 1000;

function binaryTreeWorkload(size) {
  let a = new Array(size);
  for (let i = 0; i < size; i++) {
    a[i] = { left: null, right: null, map: null };
  }
  for (let i = 0; i < size / 2; i++) {
    a[i].left = a[2 * i + 1];
    a[i].right = a[2 * i + 2];
  }
  return a;
}

function weakMapsArray(size) {
  let a = new Array(size);
  for (let i = 0; i < size; i++) {
    let m = new WeakMap();
    m.set(m, 0);
    a[i] = m;
  }
  return a;
}

gcparam("parallelMarkingEnabled", 1);
gcparam("parallelMarkingThresholdMB", 0);

let t1 = binaryTreeWorkload(size);
let t2 = binaryTreeWorkload(size);
let maps = weakMapsArray(size);

for (let i = 0; i < size; i++) {
  t1[i].map = maps[i];
  t2[i].map = maps[size - i - 1];
}

t1 = t1[0];
t2 = t2[0];
maps = undefined;

for (let i = 0; i < iterations; i++) {
  gc();
}
