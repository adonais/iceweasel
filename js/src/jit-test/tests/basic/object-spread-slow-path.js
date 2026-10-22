// Object spread over sources that CopyDataPropertiesNative can't copy, so
// they take the key-by-key path: getters, indexed properties, and targets
// that already have properties.

function keys(o) {
  return Reflect.ownKeys(o).map(String).join(",");
}

function testGetters() {
  var from, to;

  // A getter can delete a later key.
  from = {get a() { delete this.b; return 1; }, b: 2, c: 3};
  to = {...from};
  assertEq(keys(to), "a,c");

  // A getter can make a later key non-enumerable.
  from = {
    get a() {
      Object.defineProperty(this, "b", {enumerable: false});
      return 1;
    },
    b: 2,
    c: 3,
  };
  to = {...from};
  assertEq(keys(to), "a,c");

  // A getter can replace a later data property with an accessor.
  from = {
    get a() {
      Object.defineProperty(this, "b", {get() { return "new"; }});
      return 1;
    },
    b: 2,
  };
  to = {...from};
  assertEq(to.b, "new");
  assertEq(Object.getOwnPropertyDescriptor(to, "b").value, "new");

  // Keys added by a getter aren't copied.
  from = {get a() { this.z = 26; return 1; }, b: 2};
  to = {...from};
  assertEq(keys(to), "a,b");

  // A getter that throws.
  from = {x: 1, get y() { throw "boom"; }, z: 3};
  try {
    to = {...from};
    assertEq(true, false);
  } catch (e) {
    assertEq(e, "boom");
  }

  // A setter without a getter copies undefined.
  from = {set a(v) { throw "setter called"; }, b: 2};
  to = {...from};
  assertEq(keys(to), "a,b");
  assertEq(to.a, undefined);
  assertEq(Object.getOwnPropertyDescriptor(to, "a").writable, true);

  // Non-enumerable and inherited getters aren't called.
  var proto = {get inherited() { throw "inherited getter called"; }};
  from = Object.create(proto);
  Object.defineProperty(from, "hidden", {
    get() { throw "hidden getter called"; },
    enumerable: false,
  });
  from.own = 1;
  Object.defineProperty(from, "g", {get() { return 7; }, enumerable: true});
  to = {...from};
  assertEq(keys(to), "own,g");
  assertEq(to.g, 7);
}

function testIndexed() {
  var from, to;

  // Dense elements, string keys and a getter together.
  from = {b: 1, get g() { return "g"; }};
  from[1] = "one";
  from[0] = "zero";
  to = {...from};
  assertEq(keys(to), "0,1,b,g");
  assertEq(to[0], "zero");
  assertEq(to.g, "g");

  // Holes aren't copied.
  to = {...[1, , 3]};
  assertEq(keys(to), "0,2");

  // A non-enumerable element isn't copied.
  from = [10, 20, 30];
  Object.defineProperty(from, 1, {enumerable: false});
  to = {...from};
  assertEq(keys(to), "0,2");

  // Typed arrays and String objects with extra properties.
  from = new Int8Array([1, 2]);
  from.extra = "e";
  to = {...from};
  assertEq(keys(to), "0,1,extra");
  assertEq(to[1], 2);

  from = new String("ab");
  from.extra = "e";
  from[5] = "five";
  to = {...from};
  assertEq(keys(to), "0,1,5,extra");
  assertEq(to[1], "b");
  assertEq(to[5], "five");

  // Arguments objects.
  function mapped(a, b) {
    delete arguments[0];
    return {...arguments};
  }
  to = mapped(1, 2, 3);
  assertEq(keys(to), "1,2");
  assertEq(to[2], 3);

  function unmapped(a, b) {
    "use strict";
    arguments.extra = "e";
    return {...arguments};
  }
  to = unmapped(1, 2);
  assertEq(keys(to), "0,1,extra");
}

function testNonEmptyTarget() {
  var from, to, set;

  // A colliding key is overwritten in place.
  from = {a: 2, get b() { return 3; }};
  to = {c: 0, a: 1, ...from};
  assertEq(keys(to), "c,a,b");
  assertEq(to.a, 2);

  // A colliding accessor on the target becomes a data property.
  to = {get a() { return "target"; }, ...from};
  assertEq(Object.getOwnPropertyDescriptor(to, "a").value, 2);
  assertEq(Object.getOwnPropertyDescriptor(to, "a").get, undefined);

  // Colliding integer keys.
  from = ["x", "y"];
  to = {0: "t0", 5: "t5", ...from};
  assertEq(keys(to), "0,1,5");
  assertEq(to[0], "x");

  // Copying defines, so setters on the prototype don't run.
  set = false;
  var proto = {set a(v) { set = true; }};
  from = {a: 1, get b() { return 2; }};
  to = {__proto__: proto, ...from};
  assertEq(set, false);
  assertEq(Object.getOwnPropertyDescriptor(to, "a").value, 1);
  to = {__proto__: proto, x: 0, ...from};
  assertEq(set, false);
  assertEq(keys(to), "x,a,b");
}

testGetters();
testIndexed();
testNonEmptyTarget();
