// |jit-test| --emit-interpreter-entry

async function plain(a, b) {
  var x = await a;
  assertEq(x, 1);
  assertEq(b, 2);
  return x + 1;
}

async function* asyncGen(a) {
  var x = await a;
  yield x;
  yield x + 1;
  assertEq(a, 1);
}

async function forAwait(a) {
  var sum = 0;
  for await (var x of [a, a + 1, a + 2]) {
    sum += x;
  }
  return sum;
}

async function thrower(a) {
  await a;
  throw "boom";
}

var results = [];
for (var i = 0; i < 30; i++) {
  plain(1, 2).then(v => results.push(v));

  (async function () {
    var values = [];
    for await (var v of asyncGen(1)) {
      values.push(v);
    }
    assertEq(values.join(","), "1,2");
    results.push("gen");
  })();

  forAwait(1).then(v => {
    assertEq(v, 6);
    results.push("forAwait");
  });

  thrower(1).catch(e => {
    assertEq(e, "boom");
    results.push("thrower");
  });
}

drainJobQueue();

assertEq(results.length, 30 * 4);
assertEq(results.filter(v => v === 2).length, 30);
assertEq(results.filter(v => v === "gen").length, 30);
assertEq(results.filter(v => v === "forAwait").length, 30);
assertEq(results.filter(v => v === "thrower").length, 30);
