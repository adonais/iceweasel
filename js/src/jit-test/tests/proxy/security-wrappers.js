// Test cross-compartment operations with newGlobal's securityWrappers option.

load(libdir + "asserts.js");

var g = newGlobal({newCompartment: true, securityWrappers: true});
g.libdir = libdir;
g.eval(`load(libdir + "asserts.js");`);

var obj = {x: 1, f() { return 2; }};
function fun() { return 3; }
var arr = [1, 2];

// Objects can be passed into |g| and are wrapped with a security wrapper there.
g.obj = obj;
g.fun = fun;
g.arr = arr;
assertEq(g.obj, obj);
assertEq(g.eval("obj"), obj);
assertEq(g.eval("(o => o)")(obj), obj);

g.eval(`
  function assertDenied(f) {
    assertErrorMessage(f, Error, "Permission denied to access object");
  }

  assertEq(isProxy(obj), true);
  assertEq(typeof obj, "object");
  assertEq(typeof fun, "function");
  assertEq(obj === obj, true);
  assertEq(obj === fun, false);

  // Property access is denied.
  assertDenied(() => obj.x);
  assertDenied(() => obj["x"]);
  assertDenied(() => obj[0]);
  assertDenied(() => obj[Symbol.iterator]);
  assertDenied(() => { obj.x = 2; });
  assertDenied(() => "x" in obj);
  assertDenied(() => delete obj.x);
  assertDenied(() => Object.prototype.hasOwnProperty.call(obj, "x"));
  assertDenied(() => Object.getOwnPropertyDescriptor(obj, "x"));
  assertDenied(() => Object.defineProperty(obj, "y", {value: 1}));
  assertDenied(() => Object.defineProperty(obj, "y", {get() {}}));
  assertDenied(() => Object.keys(obj));
  assertDenied(() => Reflect.ownKeys(obj));
  assertDenied(() => { for (var k in obj) {} });
  assertDenied(() => obj.f());
  assertDenied(() => JSON.stringify(obj));
  assertDenied(() => String(obj));
  assertDenied(() => Object.prototype.toString.call(obj));

  // Calls and constructs are denied.
  assertDenied(() => fun());
  assertDenied(() => new fun());
  assertDenied(() => fun.call());
  assertDenied(() => Reflect.apply(fun, null, []));

  // Function.prototype.toString doesn't throw and doesn't leak the source.
  assertEq(Function.prototype.toString.call(fun),
           "function () {\\n    [native code]\\n}");
  assertErrorMessage(() => Function.prototype.toString.call(obj), TypeError,
                     /incompatible object/);

  // Prototype and extensibility.
  assertEq(Object.getPrototypeOf(obj) !== null, true);
  assertDenied(() => Object.setPrototypeOf(obj, null));
  assertEq(Object.isExtensible(obj), true);
  assertErrorMessage(() => Object.preventExtensions(obj), TypeError,
                     /can't change object's extensibility/);

  // Class checks don't reveal the target's class.
  assertEq(Array.isArray(arr), false);
  assertDenied(() => Map.prototype.has.call(obj, 1));

  // The wrapper can be used as a key in collections.
  var wm = new WeakMap();
  wm.set(obj, 1);
  assertEq(wm.get(obj), 1);
  assertEq(new Set([obj]).has(obj), true);

  // The wrapper can't be unwrapped to find the target's global.
  assertEq(objectGlobal(obj), null);
`);
assertEq(g.eval("typeof fun"), "function");

// Primitives pass through unchanged.
g.num = 1;
g.str = "foo";
g.sym = Symbol.iterator;
assertEq(g.eval("num + str.length"), 4);
assertEq(g.eval("sym === Symbol.iterator"), true);

// The original object is unaffected.
assertEq(obj.x, 1);
assertEq(fun(), 3);

// Objects from |g| are wrapped with normal cross-compartment wrappers in this
// compartment, so all operations work.
var o = g.eval(`({y: 5, f() { return this.y; }, arr: [1, 2, 3]})`);
assertEq(isProxy(o), true);
assertEq(o.y, 5);
assertEq(o.f(), 5);
o.z = 6;
assertEq(g.eval("(o => o.z)")(o), 6);
assertEq("z" in o, true);
assertEq(delete o.z, true);
assertEq("z" in o, false);
assertEq(Object.keys(o).join(), "y,f,arr");
assertEq(Array.isArray(o.arr), true);
assertEq(o.arr.length, 3);
var gfun = g.eval("(function(a, b) { return a + b; })");
assertEq(gfun(1, 2), 3);
assertEq(new (g.eval("(function C() { this.v = 7; })"))().v, 7);
assertEq(Function.prototype.toString.call(gfun), "function(a, b) { return a + b; }");

// Objects from |g| passed back into |g| are unwrapped.
assertEq(g.eval("(x => x)")(o), o);
g.o = o;
assertEq(g.eval("isProxy(o)"), false);
assertEq(g.eval("o.y"), 5);

// Wrappers in |g| for objects from this compartment can be passed back out.
assertEq(g.eval("(function() { return obj; })")(), obj);
assertEq(g.eval("[obj, fun]")[1], fun);
