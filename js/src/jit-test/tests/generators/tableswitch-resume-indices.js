// |jit-test| --fast-warmup

function* syncGen() {
  for (var i = 0; i < 100; i++) {
    yield i * 10 + 1;
    switch (i % 5) {
      case 0: yield i * 10 + 2; break;
      case 1: yield i * 10 + 3; break;
      case 2: yield i * 10 + 4; break;
      case 3: yield i * 10 + 5; break;
      case 4: yield i * 10 + 6; break;
    }
    yield i * 10 + 7;
  }
}
async function asyncFun() {
  var sum = 0;
  for (var i = 0; i < 100; i++) {
    sum += await (i * 20 + 1);
    switch (i % 5) {
      case 0: sum += await (i * 20 + 2); break;
      case 1: sum += await (i * 20 + 3); break;
      case 2: sum += await (i * 20 + 4); break;
      case 3: sum += await (i * 20 + 5); break;
      case 4: sum += await (i * 20 + 6); break;
    }
    sum += await (i * 20 + 7);
  }
  return sum;
}
async function* asyncGen() {
  for (var i = 0; i < 100; i++) {
    yield i * 30 + 1;
    switch (i % 5) {
      case 0: yield i * 30 + 2; break;
      case 1: yield i * 30 + 3; break;
      case 2: yield i * 30 + 4; break;
      case 3: yield i * 30 + 5; break;
      case 4: yield i * 30 + 6; break;
    }
    yield i * 30 + 7;
  }
}
function test() {
  var sum = 0;
  for (var x of syncGen()) {
    sum += x;
  }
  assertEq(sum, 149700);

  asyncFun().then(v => { sum = v; });
  drainJobQueue();
  assertEq(sum, 298200);

  sum = 0;
  var it = asyncGen();
  while (true) {
    var res;
    it.next().then(v => { res = v; });
    drainJobQueue();
    if (res.done) {
      break;
    }
    sum += res.value;
  }
  assertEq(sum, 446700);
}
test();
test();
