// Tests for for-of loops + `await using`, in particular cases where the for-of
// head has no lexical declarations.

let log = [];

function test(f, expected) {
  log = [];
  f();
  drainJobQueue();
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

function makeAsyncIter() {
  let i = 0;
  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      return {value: i, done: i++ >= 3};
    },
    async return() {
      log.push("async-it.return");
      return {done: true};
    },
  };
}

function makeAsyncRes() {
  return {disposed: false,
          [Symbol.asyncDispose]() {
            log.push("asyncDispose");
            this.disposed = true;
            return Promise.resolve();
          }};
}

// Like makeIter, but yields async resources and logs a distinct `return` label.
function makeAsyncResIter() {
  let i = 0;
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      return {value: makeAsyncRes(), done: i++ >= 3};
    },
    return() {
      log.push("res-it.return");
      return {done: true};
    },
  };
}

// break, and the resource is still live after the loop.
test(function() {
  (async function() {
    var x;
    {
      await using a = makeAsyncRes();
      for (x of makeIter()) {
        break;
      }
      assertEq(a.disposed, false);
      log.push("after loop");
    }
    log.push("left block");
  })();
}, "it.return,after loop,asyncDispose,left block");

// return a value out of a for-await-of, no lexical declaration in the head.
test(function() {
  (async function() {
    var x;
    {
      await using a = makeAsyncRes();
      for await (x of makeAsyncIter()) {
        return "rval";
      }
    }
  })().then(v => log.push(`resolved: ${v}`));
}, "async-it.return,asyncDispose,resolved: rval");

// return out of an inner for-of nested in a for-of head with `await using`.
test(function() {
  (async function() {
    var b;
    for (await using a of makeAsyncResIter()) {
      for (b of makeIter()) {
        return "rval";
      }
    }
  })().then(v => log.push(`resolved: ${v}`));
}, "it.return,asyncDispose,res-it.return,resolved: rval");

// An async generator left via a forced return at a yield inside the loop.
test(function() {
  const gen = (async function*() {
    var x;
    {
      await using a = makeAsyncRes();
      for (x of makeIter()) {
        yield 1;
      }
    }
  })();
  gen.next()
     .then(() => gen.return("rval"))
     .then(r => log.push(`returned: ${r.value}`));
}, "it.return,asyncDispose,returned: rval");

// Test throw behavior.
test(function() {
  (async function() {
    var x;
    try {
      {
        await using a = makeAsyncRes();
        for (x of makeIter()) {
          throw new Error("e");
        }
      }
    } catch (e) {
      log.push("caught");
    }
  })();
}, "it.return,asyncDispose,caught");
