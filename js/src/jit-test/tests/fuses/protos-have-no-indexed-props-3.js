// |jit-test| --fast-warmup; --no-threads

// Test element hole reads optimized with the no-indexed-properties fuses return
// the correct value after the fuses are popped.

function test(popCode, expectedArr, expectedObj) {
  var g = newGlobal();
  g.evaluate(`
    function getHole(a, i) {
      return a[i];
    }
    function hasHole(a, i) {
      return i in a;
    }
    function getSparse(a, i) {
      return a[i];
    }
    function getArgs(i) {
      return arguments[i];
    }
    function hasArgs(i) {
      return i in arguments;
    }
    function run(expectedArr, expectedObj) {
      var arr = [0, , 2];
      var obj = {0: 0};
      var sparseArr = [];
      sparseArr[10000] = 1;
      var sparseObj = {};
      sparseObj[10000] = 1;
      for (var i = 0; i < 200; i++) {
        assertEq(getHole(arr, 1), expectedArr);
        assertEq(getHole(obj, 1), expectedObj);
        assertEq(hasHole(arr, 1), expectedArr !== undefined);
        assertEq(hasHole(obj, 1), expectedObj !== undefined);
        assertEq(getSparse(sparseArr, 1), expectedArr);
        assertEq(getSparse(sparseObj, 1), expectedObj);
        assertEq(getArgs(1), expectedObj);
        assertEq(hasArgs(1), expectedObj !== undefined);
      }
    }
    run(undefined, undefined);
    assertEq(getFuseState().ObjectProtoHasNoIndexedPropsFuse.intact, true);
    assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact, true);
    ${popCode}
    assertEq(getFuseState().ObjectProtoHasNoIndexedPropsFuse.intact,
             ${expectedObj === undefined});
    assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact, false);
    run(${expectedArr}, ${expectedObj});
  `);
}

test(`Object.prototype[1] = 1;`, 1, 1);
test(`Object.defineProperty(Object.prototype, 1, {get() { return 2; }});`, 2, 2);
test(`Object.prototype[1e9] = 3; Object.prototype[1] = 3;`, 3, 3);
test(`Array.prototype[1] = 4;`, 4, undefined);
test(`Array.prototype.push(0, 5);`, 5, undefined);
test(`Array.prototype[1e9] = 6; Array.prototype[1] = 6;`, 6, undefined);
test(`Object.setPrototypeOf(Array.prototype, {1: 7});`, 7, undefined);

// Test receivers with a prototype chain that reaches one of the fuse-protected
// prototypes after one or more other prototypes.
function testProtoChain(popCode, expected, objectIntact, arrayIntact) {
  var g = newGlobal();
  g.evaluate(`
    class C {
      constructor() {
        this[0] = 0;
      }
    }
    class D extends C {}
    class MyArray extends Array {}
    function getHole(o, i) {
      return o[i];
    }
    function hasHole(o, i) {
      return i in o;
    }
    function run(expected) {
      for (var i = 0; i < 200; i++) {
        var c = new C();
        assertEq(getHole(c, 1), expected);
        assertEq(hasHole(c, 1), expected !== undefined);
        var d = new D();
        assertEq(getHole(d, 1), expected);
        assertEq(hasHole(d, 1), expected !== undefined);
        var a = new MyArray();
        a[0] = 0;
        assertEq(getHole(a, 1), expected);
        assertEq(hasHole(a, 1), expected !== undefined);
      }
    }
    run(undefined);
    ${popCode}
    assertEq(getFuseState().ObjectProtoHasNoIndexedPropsFuse.intact,
             ${objectIntact});
    assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact,
             ${arrayIntact});
    run(${expected});
  `);
}

// Pop the fuses.
testProtoChain(`Object.prototype[1] = 1;`, 1, false, false);
testProtoChain(`Array.prototype[1] = 2; C.prototype[1] = 2;`, 2, true, false);

// Add indexed properties to prototypes that aren't covered by the fuses. The
// fuses stay intact so the shape guards for these prototypes must fail.
testProtoChain(`C.prototype[1] = 3; MyArray.prototype[1] = 3;`, 3, true, true);
testProtoChain(`Object.defineProperty(C.prototype, 1, {get() { return 4; }});
                Object.defineProperty(MyArray.prototype, 1, {get() { return 4; }});`,
               4, true, true);
testProtoChain(`Object.setPrototypeOf(C.prototype, {1: 5});
                Object.setPrototypeOf(MyArray.prototype, [, 5]);`,
               5, true, true);

// No indexed properties are added.
testProtoChain(`C.prototype.foo = 1; MyArray.prototype.bar = 2;`, undefined,
               true, true);
