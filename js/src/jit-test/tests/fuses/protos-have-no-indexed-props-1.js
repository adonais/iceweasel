// Test the VM operations that pop ObjectProtoHasNoIndexedPropsFuse and
// ArrayProtoHasNoIndexedPropsFuse.

function test(code, objectIntact, arrayIntact) {
  var g = newGlobal();
  g.evaluate(`
    function check(objectIntact, arrayIntact) {
      var state = getFuseState();
      assertEq(state.ObjectProtoHasNoIndexedPropsFuse.intact, objectIntact);
      assertEq(state.ArrayProtoHasNoIndexedPropsFuse.intact, arrayIntact);
    }
    check(true, true);
    ${code}
    check(${objectIntact}, ${arrayIntact});
  `);
}

// Popping the Object.prototype fuse also pops the Array.prototype fuse.
function testPopsObject(code) {
  test(code, false, false);
}
function testPopsArray(code) {
  test(code, true, false);
}
function testDoesNotPop(code) {
  test(code, true, true);
}

// Dense elements.
testPopsArray("Array.prototype[0] = 1;");
testPopsObject("Object.prototype[0] = 1;");
testPopsArray("Array.prototype[3] = 1;");
testPopsArray("Object.defineProperty(Array.prototype, 0, {value: 1});");
testPopsObject("Object.defineProperty(Object.prototype, 0, {value: 1});");
testPopsArray("Array.prototype.push(1);");
testPopsObject("Array.prototype.push.call(Object.prototype, 1);");
testPopsArray("Array.prototype.unshift(1);");
testPopsArray("Array.prototype.splice(0, 0, 1, 2);");
testPopsArray("Array.prototype.fill.call(Object.assign(Array.prototype, {length: 2}), 0);");
testPopsArray("Reflect.set(Array.prototype, 0, 1);");
testPopsObject("Object.assign(Object.prototype, [1, 2]);");
testPopsObject("class B { constructor() { return Object.prototype; } } class D extends B { 0 = 1; } new D();");
testPopsArray("class B { constructor() { return Array.prototype; } } class D extends B { [1] = 1; } new D();");

// Sparse indexed properties.
testPopsArray("Array.prototype[1e9] = 1;");
testPopsObject("Object.prototype[4294967294] = 1;");
testPopsObject("Object.defineProperty(Object.prototype, 0, {get() { return 1; }});");
testPopsArray("Object.defineProperty(Array.prototype, 2, {get() { return 1; }});");
testPopsObject("Object.prototype.__defineSetter__(1, function() {});");

// Prototype changes.
testPopsArray("Object.setPrototypeOf(Array.prototype, null);");
testPopsArray("Object.setPrototypeOf(Array.prototype, {});");
testPopsArray("Array.prototype.__proto__ = Object.create(Object.prototype);");

// Popping the Array.prototype fuse doesn't affect the Object.prototype fuse.
testPopsArray("Array.prototype[0] = 1; Array.prototype[1e9] = 2; Object.setPrototypeOf(Array.prototype, null);");
testPopsObject("Array.prototype[0] = 1; Object.prototype[0] = 1;");

// Operations that don't add indexed properties to the prototypes.
testDoesNotPop("Array.prototype.length = 10;");
testDoesNotPop("Array.prototype[-1] = 1; Object.prototype[4294967295] = 1;");
testDoesNotPop("Object.prototype.foo = 1; Array.prototype.bar = 2;");
testDoesNotPop("Array.prototype.push.call(Array.prototype);");
testDoesNotPop("var arr = []; arr[0] = 1; arr.push(2); var obj = {}; obj[0] = 1;");
testDoesNotPop("Object.freeze(Array.prototype); Object.freeze(Object.prototype);");
testDoesNotPop("Object.preventExtensions(Array.prototype);");
testDoesNotPop("Object.setPrototypeOf(Object.prototype, null);");
testDoesNotPop("try { Object.setPrototypeOf(Object.prototype, {}); } catch {}");
testDoesNotPop("Object.setPrototypeOf(Array.prototype, Object.prototype);");
testDoesNotPop("Array.prototype.indexOf(1); Array.prototype.slice(); Array.prototype.concat([1]);");
testDoesNotPop("Object.setPrototypeOf(Object.create(Array.prototype), {})[0] = 1;");

// Indexed properties on prototypes in another realm don't affect this realm.
var g = newGlobal({sameCompartmentAs: this});
assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact, true);
g.Array.prototype[0] = 1;
assertEq(g.getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact, false);
assertEq(g.getFuseState().ObjectProtoHasNoIndexedPropsFuse.intact, true);
assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact, true);
g = newGlobal({sameCompartmentAs: this});
g.Object.prototype[1e9] = 1;
assertEq(g.getFuseState().ObjectProtoHasNoIndexedPropsFuse.intact, false);
assertEq(g.getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact, false);
assertEq(getFuseState().ObjectProtoHasNoIndexedPropsFuse.intact, true);
assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact, true);
