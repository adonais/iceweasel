// Tests for for-of loops + `using`, in particular cases where the for-of head has
// no lexical declarations.

let log = [];

function test(f, expected) {
  log = [];
  f();
  assertEq(log.join(","), expected);
}

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

// Like makeIter, but yields resources and logs a distinct `return` label.
function makeResIter() {
  let i = 0;
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      return {value: makeRes(), done: i++ >= 3};
    },
    return() {
      log.push("res-it.return");
      return {done: true};
    },
  };
}

// return, no lexical declaration in the head.
test(function() {
  var x;
  {
    using a = makeRes();
    for (x of makeIter()) {
      return;
    }
  }
}, "it.return,dispose");

// break, and the resource is still live after the loop.
test(function() {
  var x;
  {
    using a = makeRes();
    for (x of makeIter()) {
      break;
    }
    assertEq(a.disposed, false);
    log.push("after loop");
  }
  log.push("left block");
}, "it.return,after loop,dispose,left block");

// The head assigns to a member expression, so it has no scope of its own.
test(function() {
  const obj = {};
  {
    using a = makeRes();
    for (obj.prop of makeIter()) {
      break;
    }
    assertEq(a.disposed, false);
  }
  assertEq(obj.prop, 0);
}, "it.return,dispose");

// continue out of an inner for-of crosses the inner loop only.
test(function() {
  var x, y;
  {
    using a = makeRes();
    outer: for (y of makeIter()) {
      for (x of makeIter()) {
        continue outer;
      }
    }
    assertEq(a.disposed, false);
  }
}, "it.return,it.return,it.return,dispose");

// `using` in the enclosing function body scope rather than a block.
test(function() {
  var x;
  using a = makeRes();
  for (x of makeIter()) {
    return;
  }
}, "it.return,dispose");

// The enclosing scope is another for-of head.
test(function() {
  var b;
  for (using a of [makeRes(), makeRes()]) {
    for (b of makeIter()) {
      break;
    }
    assertEq(a.disposed, false);
  }
}, "it.return,dispose,it.return,dispose");

// return out of an inner for-of nested in a for-of head with `using`.
test(function() {
  var b;
  for (using a of makeResIter()) {
    for (b of makeIter()) {
      return;
    }
  }
}, "it.return,dispose,res-it.return");

// A lexical declaration in the head behaves correctly.
test(function() {
  {
    using a = makeRes();
    for (const x of makeIter()) {
      return;
    }
  }
}, "it.return,dispose");

// `using` in the loop body is disposed before IteratorClose.
test(function() {
  for (const x of makeIter()) {
    using a = makeRes();
    return;
  }
}, "dispose,it.return");

// The head's own `using` is disposed before IteratorClose.
test(function() {
  for (using r of [makeRes()]) {
    return;
  }
}, "dispose");

// Test throw behavior.
test(function() {
  var x;
  try {
    {
      using a = makeRes();
      for (x of makeIter()) {
        throw new Error("e");
      }
    }
  } catch (e) {}
}, "it.return,dispose");
