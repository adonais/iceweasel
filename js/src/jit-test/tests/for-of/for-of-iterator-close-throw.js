// ForOfIterator must not call `.return()` on optimized array objects.
function testOptimizedArray() {
  let called = 0;
  let a = [1, "not-a-number", 3];
  Array.prototype.return = function() {
    called++;
    return {};
  };
  let exc = null;
  try {
    Math.sumPrecise(a);
  } catch (e) {
    exc = e;
  }
  assertEq(exc.toString().includes("must be numbers"), true);
  assertEq(called, 0);
}
testOptimizedArray();

// ForOfIterator must call `.return()` for objects we don't optimize.
function testUnoptimized() {
  let returned = 0;
  let thisVal = null;
  const iterator = {
    i: 0,
    next() {
      if (this.i === 0) {
        this.i++;
        return {value: "not-a-number", done: false};
      }
      return {value: undefined, done: true};
    },
    return() {
      returned++;
      thisVal = this;
      return {};
    },
  };
  const iterable = {
    [Symbol.iterator]() {
      return iterator;
    }
  };
  let exc = null;
  try {
    Math.sumPrecise(iterable);
  } catch (e) {
    exc = e;
  }
  assertEq(exc.toString().includes("must be numbers"), true);
  assertEq(returned, 1);
  assertEq(thisVal, iterator);
}
testUnoptimized();
