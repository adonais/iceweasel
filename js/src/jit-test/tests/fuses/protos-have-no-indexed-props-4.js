// |jit-test| --fast-warmup; --no-threads

// Test element adds optimized with the no-indexed-properties fuses call setters
// on the prototype chain after the fuses are popped.

function test(popCode, objectSetter) {
  var g = newGlobal();
  g.evaluate(`
    var setterCalls = 0;
    function setter(v) {
      setterCalls++;
    }
    function setElem(o, i, v) {
      o[i] = v;
    }
    function push(a, v) {
      a.push(v);
    }
    function run(arraySetter, objectSetter) {
      for (var i = 0; i < 200; i++) {
        var arr = [];
        setElem(arr, 0, 1);
        assertEq(arr.length, arraySetter ? 0 : 1);

        var arr2 = [];
        push(arr2, 2);
        assertEq(arr2.length, 1);
        assertEq(arr2.hasOwnProperty(0), !arraySetter);

        var sparse = [];
        sparse[10000] = 1;
        setElem(sparse, 0, 3);
        assertEq(sparse.hasOwnProperty(0), !arraySetter);

        var obj = {};
        setElem(obj, 0, 4);
        assertEq(obj.hasOwnProperty(0), !objectSetter);
      }
    }
    run(false, false);
    assertEq(setterCalls, 0);
    assertEq(getFuseState().ObjectProtoHasNoIndexedPropsFuse.intact, true);
    assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact, true);
    ${popCode}
    assertEq(getFuseState().ObjectProtoHasNoIndexedPropsFuse.intact,
             ${!objectSetter});
    assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact, false);
    run(true, ${objectSetter});
    assertEq(setterCalls, 200 * ${objectSetter ? 4 : 3});
  `);
}

test("Object.defineProperty(Object.prototype, 0, {set: setter});", true);
test("Object.defineProperty(Array.prototype, 0, {set: setter});", false);
test("Object.setPrototypeOf(Array.prototype, {set 0(v) { setter(v); }});", false);

// Test receivers with a prototype chain that reaches one of the fuse-protected
// prototypes after one or more other prototypes.
function testProtoChain(popCode, hasSetter, objectIntact, arrayIntact) {
  var g = newGlobal();
  g.evaluate(`
    class C {
      constructor() {
        this[0] = 0;
      }
    }
    class D extends C {}
    class MyArray extends Array {}
    var setterCalls = 0;
    function setElem(o, i, v) {
      o[i] = v;
    }
    function push(a, v) {
      a.push(v);
    }
    function defineSetter(o) {
      Object.defineProperty(o, 1, {set(v) { setterCalls++; }});
    }
    function run(hasSetter) {
      for (var i = 0; i < 200; i++) {
        var c = new C();
        setElem(c, 1, i);
        assertEq(Object.hasOwn(c, 1), !hasSetter);
        var d = new D();
        setElem(d, 1, i);
        assertEq(Object.hasOwn(d, 1), !hasSetter);
        var a = new MyArray();
        a[0] = 0;
        setElem(a, 1, i);
        assertEq(Object.hasOwn(a, 1), !hasSetter);
        a = new MyArray();
        a[0] = 0;
        push(a, i);
        assertEq(Object.hasOwn(a, 1), !hasSetter);
      }
    }
    run(false);
    ${popCode}
    assertEq(getFuseState().ObjectProtoHasNoIndexedPropsFuse.intact,
             ${objectIntact});
    assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact,
             ${arrayIntact});
    run(${hasSetter});
    assertEq(setterCalls, ${hasSetter ? 200 * 4 : 0});
  `);
}

// Pop the fuses.
testProtoChain(`defineSetter(Object.prototype);`, true, false, false);
testProtoChain(`defineSetter(Array.prototype); defineSetter(C.prototype);`,
               true, true, false);

// Add setters to prototypes that aren't covered by the fuses. The fuses stay
// intact so the shape guards for these prototypes must fail.
testProtoChain(`defineSetter(C.prototype); defineSetter(MyArray.prototype);`,
               true, true, true);
testProtoChain(`Object.setPrototypeOf(C.prototype, {set 1(v) { setterCalls++; }});
                Object.setPrototypeOf(MyArray.prototype, Object.create(Array.prototype));
                defineSetter(Object.getPrototypeOf(MyArray.prototype));`,
               true, true, true);

// No indexed properties are added.
testProtoChain(`C.prototype.foo = 1; MyArray.prototype.bar = 2;`, false, true,
               true);
