// |jit-test| --fast-warmup; --no-threads

// Test StringProtoHasNoIndexedPropsFuse and out-of-bounds string element
// reads.

function testPop(code, objectIntact) {
  var g = newGlobal();
  g.evaluate(`
    assertEq(getFuseState().StringProtoHasNoIndexedPropsFuse.intact, true);
    ${code}
    assertEq(getFuseState().StringProtoHasNoIndexedPropsFuse.intact, false);
    assertEq(getFuseState().ObjectProtoHasNoIndexedPropsFuse.intact,
             ${objectIntact});
    assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact,
             ${objectIntact});
  `);
}
testPop("String.prototype[0] = 1;", true);
testPop("String.prototype[1e9] = 1;", true);
testPop("Object.defineProperty(String.prototype, 3, {get() { return 1; }});", true);
testPop("Object.setPrototypeOf(String.prototype, {});", true);
testPop("Object.prototype[2] = 1;", false);

function testDoesNotPop(code) {
  var g = newGlobal();
  g.evaluate(`
    ${code}
    assertEq(getFuseState().StringProtoHasNoIndexedPropsFuse.intact, true);
  `);
}
testDoesNotPop("String.prototype.foo = 1; String.prototype[-1] = 2;");
testDoesNotPop("Array.prototype[0] = 1;");
testDoesNotPop("new String('abc')[5] = 1; Object('x')[0];");

// Element reads on strings, including out-of-bounds reads and negative indices.
function test(code, expectedOOB, expectedNeg) {
  var g = newGlobal();
  g.evaluate(`
    function get(s, i) {
      return s[i];
    }
    function run(expectedOOB, expectedNeg) {
      var strs = ["abc", "de", "f" + "ghijklmnopqrstuvwxyz".repeat(2)];
      for (var i = 0; i < 200; i++) {
        var s = strs[i % 3];
        assertEq(get(s, 0), s[0]);
        assertEq(get(s, 1), s.charAt(1));
        assertEq(get(s, s.length), expectedOOB);
        assertEq(get(s, 1000), expectedOOB);
      }
      for (var i = 0; i < 200; i++) {
        assertEq(get("abc", i % 5 - 1), [expectedNeg, "a", "b", "c", expectedOOB][i % 5]);
      }
    }
    run(undefined, undefined);
    String.prototype[-1] = "neg";
    run(undefined, "neg");
    ${code}
    run(${expectedOOB}, "neg");
  `);
}
test("String.prototype[1000] = 'x'; String.prototype[3] = 'x'; String.prototype[2] = 'x'; String.prototype[41] = 'x';", "'x'", "neg");
test("Object.prototype[1000] = 'y'; Object.prototype[3] = 'y'; Object.prototype[2] = 'y'; Object.prototype[41] = 'y';", "'y'", "neg");
test("Object.setPrototypeOf(String.prototype, new Proxy({}, {get(t, k, r) { return k === '-1' ? 'neg' : 'z'; }}));", "'z'", "neg");

// Element hole reads and adds on objects whose prototype is String.prototype.
function testStringProtoReceiver(proto) {
  var g = newGlobal();
  g.evaluate(`
    var setterCalls = 0;
    function getHole(o, i) {
      return o[i];
    }
    function setElem(o, i, v) {
      o[i] = v;
    }
    function run(popped) {
      for (var i = 0; i < 200; i++) {
        var o = {__proto__: String.prototype, 0: 0};
        assertEq(getHole(o, 1), popped ? "x" : undefined);
        var o2 = Object.create(String.prototype);
        setElem(o2, 0, i);
        assertEq(Object.hasOwn(o2, 0), !popped);
      }
    }
    run(false);
    Object.defineProperty(${proto}, 0, {set(v) { setterCalls++; }});
    Object.defineProperty(${proto}, 1, {get() { return "x"; }});
    assertEq(getFuseState().StringProtoHasNoIndexedPropsFuse.intact, false);
    run(true);
    assertEq(setterCalls, 200);
  `);
}
testStringProtoReceiver("String.prototype");
testStringProtoReceiver("Object.prototype");
