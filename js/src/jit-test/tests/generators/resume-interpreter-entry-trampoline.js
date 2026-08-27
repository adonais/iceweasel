// |jit-test| --emit-interpreter-entry

function* noFormals() {
  var x = yield 1;
  assertEq(x, "x");
  return 2;
}

function* formals(a, b, c) {
  var x = yield 1;
  assertEq(x, "x");
  // The resume frame pushes |undefined| for the formals, so these must come
  // from the environment.
  assertEq(a, 1);
  assertEq(b, 2);
  assertEq(c, 3);
  return 2;
}

function* withArgsObj(a) {
  var x = yield 1;
  assertEq(x, "x");
  assertEq(arguments.length, 3);
  assertEq(arguments[2], 3);
  return 2;
}

function* delegating(a) {
  var x = yield* formals(1, 2, 3);
  assertEq(x, 2);
  return 3;
}

for (var i = 0; i < 30; i++) {
  for (var gen of [noFormals, formals, withArgsObj]) {
    var it = gen(1, 2, 3);
    var res = it.next();
    assertEq(res.value, 1);
    assertEq(res.done, false);
    res = it.next("x");
    assertEq(res.value, 2);
    assertEq(res.done, true);
  }

  var it = delegating(1);
  var res = it.next();
  assertEq(res.value, 1);
  assertEq(res.done, false);
  res = it.next("x");
  assertEq(res.value, 3);
  assertEq(res.done, true);

  // Resuming with throw() and return().
  it = formals(1, 2, 3);
  assertEq(it.next().value, 1);
  var caught = null;
  try {
    it.throw("boom");
  } catch (e) {
    caught = e;
  }
  assertEq(caught, "boom");

  it = formals(1, 2, 3);
  assertEq(it.next().value, 1);
  res = it.return("done");
  assertEq(res.value, "done");
  assertEq(res.done, true);
}
