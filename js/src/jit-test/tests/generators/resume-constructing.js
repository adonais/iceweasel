// |jit-test| --fast-warmup; --no-threads

// Suspending while the JS_IS_CONSTRUCTING magic value is on the stack.

var numPlainObjects = 0;

function Plain(x, y) {
  this.z = x + y;
  numPlainObjects++;
}
class Base {
  constructor(x, y) {
    this.z = x + y;
  }
}
class Derived extends Base {
  constructor(x, y) {
    super(x, y);
  }
}

function* newDataView() {
  return new DataView(yield 0, yield 1);
}
function* newDataViewSpread() {
  return new DataView(...[yield 0, yield 1]);
}
function* newPlain() {
  return new Plain(yield 0, yield 1);
}
function* inner(x) {
  return yield x;
}
function* newPlainDelegate() {
  return new Plain(yield* inner(0), yield* inner(1));
}
function* newDerived() {
  return new Derived(yield 0, yield 1);
}

var buffer = new ArrayBuffer(8);

function testNext(f, arg1, arg2, check) {
  for (var i = 0; i < 100; i++) {
    var gen = f();
    var first = gen.next();
    assertEq(first.value, 0);
    assertEq(first.done, false);

    var second = gen.next(arg1);
    assertEq(second.value, 1);
    assertEq(second.done, false);

    var result = gen.next(arg2);
    assertEq(result.done, true);
    check(result.value);
  }
}
testNext(newDataView, buffer, 2, v => {
  assertEq(v instanceof DataView, true);
  assertEq(v.buffer, buffer);
  assertEq(v.byteOffset, 2);
});
testNext(newDataViewSpread, buffer, 3, v => {
  assertEq(v instanceof DataView, true);
  assertEq(v.buffer, buffer);
  assertEq(v.byteOffset, 3);
});
testNext(newPlain, 3, 4, v => {
  assertEq(v instanceof Plain, true);
  assertEq(v.z, 7);
});
testNext(newPlainDelegate, 3, 6, v => {
  assertEq(v instanceof Plain, true);
  assertEq(v.z, 9);
});
testNext(newDerived, -3, 7, v => {
  assertEq(v instanceof Derived, true);
  assertEq(v.z, 4);
});

function testReturn(f) {
  for (var i = 0; i < 100; i++) {
    var gen = f();
    assertEq(gen.next().value, 0);
    assertEq(gen.next().value, 1);

    var result = gen.return(42);
    assertEq(result.value, 42);
    assertEq(result.done, true);

    assertEq(gen.next().done, true);
  }
}
testReturn(newDataView);
testReturn(newDataViewSpread);
testReturn(newPlain);
testReturn(newPlainDelegate);
testReturn(newDerived);

// testReturn forces a return before the constructor is called.
assertEq(numPlainObjects, 200);
