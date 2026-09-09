// |jit-test| --fast-warmup; --no-threads

function makeIterable(value, onReturn) {
  return {
    [Symbol.iterator]() {
      return {
        next() {
          return {value, done: false};
        },
        return() {
          onReturn();
          return {done: true};
        },
      };
    },
  };
}

function assertResult(result, value, done) {
  assertEq(result.value, value);
  assertEq(result.done, done);
}

// A forced return in a try-finally with an extra value on the expression stack.
let finalized = 0;
function* assignmentInTry() {
  try {
    let object = {};
    object.property = yield 1;
  } finally {
    finalized++;
  }
}
for (let i = 0; i < 100; i++) {
  let generator = assignmentInTry();
  assertEq(generator.next().value, 1);
  assertResult(generator.return(2), 2, true);
}
assertEq(finalized, 100);

// A forced return in a for-of with an extra value on the expression stack.
let forOfClosed = 0;
function* assignmentInForOf() {
  for (let value of makeIterable(1, () => forOfClosed++)) {
    let object = {};
    object.property = yield value;
  }
}
for (let i = 0; i < 100; i++) {
  let generator = assignmentInForOf();
  assertEq(generator.next().value, 1);
  assertResult(generator.return(3), 3, true);
}
assertEq(forOfClosed, 100);

// A forced return in a for-in with extra values on the expression stack.
function* assignmentInForIn() {
  for (let property in {property: true}) {
    Math.abs(1, 2, 3, yield property);
  }
}
for (let i = 0; i < 100; i++) {
  let generator = assignmentInForIn();
  assertEq(generator.next().value, "property");
  assertResult(generator.return(4), 4, true);
}

// A forced return in a destructuring pattern with extra values on the expression
// stack.
let destructuringClosed = 0;
forOfClosed = 0;
finalized = 0;
let destructured;
function unreachable() {
  throw new Error("unreachable");
}
function* destructuringInCallAndForOf() {
  for (let value of makeIterable(1, () => forOfClosed++)) {
    try {
      unreachable(
        value,
        ([destructured = yield 5] = makeIterable(
          undefined,
          () => destructuringClosed++
        ))
      );
    } finally {
      finalized++;
    }
  }
}
for (let i = 0; i < 100; i++) {
  let generator = destructuringInCallAndForOf();
  assertEq(generator.next().value, 5);
  assertResult(generator.return(6), 6, true);
}
assertEq(destructuringClosed, 100);
assertEq(finalized, 100);
assertEq(forOfClosed, 100);

// A forced return through yield* in a try-finally.
function* yieldStarInTry(iterable) {
  try {
    yield* iterable;
  } finally {
    finalized++;
  }
}
let returnCalled = 0;
let delegated = {
  [Symbol.iterator]() {
    return this;
  },
  next() {
    return {value: 9, done: false};
  },
  return(value) {
    returnCalled++;
    assertEq(value, 10);
    return {value: 11, done: true};
  },
};
finalized = 0;
for (let i = 0; i < 100; i++) {
  let generator = yieldStarInTry(delegated);
  assertEq(generator.next().value, 9);
  assertResult(generator.return(10), 11, true);
}
assertEq(returnCalled, 100);
assertEq(finalized, 100);

delegated = {
  [Symbol.iterator]() {
    return this;
  },
  next() {
    return {value: 12, done: false};
  },
};
finalized = 0;
for (let i = 0; i < 100; i++) {
  let generator = yieldStarInTry(delegated);
  assertEq(generator.next().value, 12);
  assertResult(generator.return(13), 13, true);
}
assertEq(finalized, 100);

let delegationDone;
delegated = {
  [Symbol.iterator]() {
    return this;
  },
  next() {
    return {value: 14, done: false};
  },
  return() {
    return delegationDone
      ? {value: 16, done: true}
      : {value: 15, done: false};
  },
};

finalized = 0;
for (let i = 0; i < 100; i++) {
  delegationDone = false;
  let generator = yieldStarInTry(delegated);
  assertEq(generator.next().value, 14);
  assertResult(generator.return(), 15, false);
  delegationDone = true;
  assertResult(generator.return(), 16, true);
}
assertEq(finalized, 100);

// A forced return in a finally-block with an extra value on the expression stack.
finalized = 0;
function* yieldInFinally() {
  try {
  } finally {
    let object = {};
    object.property = yield 7;
    finalized++;
  }
}
for (let i = 0; i < 100; i++) {
  let generator = yieldInFinally();
  assertEq(generator.next().value, 7);
  assertResult(generator.return(8), 8, true);
}
assertEq(finalized, 0);
