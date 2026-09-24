// Tests for for-of loops + `using` at the top level of a module, in particular
// cases where the for-of head has no lexical declarations.

let log = [];

function makeIter() {
  let i = 0;
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      return {value: i, done: i++ >= 3};
    },
    return() {
      log.push("it.return");
      return {done: true};
    },
  };
}

function makeRes() {
  return {disposed: false,
          [Symbol.dispose]() {
            log.push("dispose");
            this.disposed = true;
          }};
}

function makeAsyncRes() {
  return {disposed: false,
          [Symbol.asyncDispose]() {
            log.push("asyncDispose");
            this.disposed = true;
            return Promise.resolve();
          }};
}

function test(source, expected) {
  log = [];
  const m = parseModule(source);
  moduleLoadAndLink(m);
  moduleEvaluate(m).catch(e => log.push(`rejected: ${e.message}`));
  drainJobQueue();
  assertEq(log.join(","), expected);
}

// break, and the resource is still live after the loop.
test(`
  let x;
  using a = makeRes();
  for (x of makeIter()) {
    break;
  }
  assertEq(a.disposed, false);
  log.push("after loop");
`, "it.return,after loop,dispose");

// Same, but the `using` is in a block instead of the module's top-level scope.
test(`
  let x;
  {
    using a = makeRes();
    for (x of makeIter()) {
      break;
    }
    log.push("after loop");
  }
  log.push("left block");
`, "it.return,after loop,dispose,left block");

// continue out of an inner for-of crosses the inner loop only.
test(`
  let x, y;
  using a = makeRes();
  outer: for (y of makeIter()) {
    for (x of makeIter()) {
      continue outer;
    }
  }
  assertEq(a.disposed, false);
`, "it.return,it.return,it.return,dispose");

// The enclosing scope is another for-of head.
test(`
  let b;
  for (using a of [makeRes(), makeRes()]) {
    for (b of makeIter()) {
      break;
    }
    assertEq(a.disposed, false);
  }
`, "it.return,dispose,it.return,dispose");

// `using` in the loop body is disposed before IteratorClose.
test(`
  let x;
  for (x of makeIter()) {
    using a = makeRes();
    break;
  }
`, "dispose,it.return");

// An uncaught exception rejects the module's evaluation promise.
test(`
  let x;
  using a = makeRes();
  for (x of makeIter()) {
    throw new Error("err");
  }
`, "it.return,dispose,rejected: err");

// Top-level `await using`.
test(`
  let x;
  await using a = makeAsyncRes();
  for (x of makeIter()) {
    break;
  }
  assertEq(a.disposed, false);
  log.push("after loop");
`, "it.return,after loop,asyncDispose");
