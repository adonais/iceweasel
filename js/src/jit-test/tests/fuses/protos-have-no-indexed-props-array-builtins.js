// Test array builtins that use ObjectMayHaveExtraIndexedProperties see indexed
// properties on the prototype chain after the fuses are popped.

function test(popCode) {
  var g = newGlobal();
  g.evaluate(`
    function check(v) {
      var proto = v !== undefined;

      assertEq([0, , 2].join(), proto ? "0,x,2" : "0,,2");
      assertEq(JSON.stringify([0, , 2]), proto ? '[0,"x",2]' : "[0,null,2]");
      assertEq(function() { return arguments[1]; }.apply(null, [0, , 2]), v);

      var a = [0, , 2, 3];
      a.reverse();
      assertEq(Object.hasOwn(a, 2), proto);
      assertEq(a[2], v);

      a = [0, , 2];
      a.shift();
      assertEq(Object.hasOwn(a, 0), proto);
      assertEq(a[0], v);

      a = [0, , 2];
      a.unshift(9);
      assertEq(Object.hasOwn(a, 2), proto);
      assertEq(a[2], v);

      var r = [0, , 2].slice();
      assertEq(Object.hasOwn(r, 1), proto);
      assertEq(r[1], v);

      r = [0, , 2, 3].splice(0, 2);
      assertEq(Object.hasOwn(r, 1), proto);
      assertEq(r[1], v);
    }
    check(undefined);
    assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact, true);
    ${popCode}
    assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact, false);
    check("x");
  `);
}
test(`Array.prototype[1] = "x";`);
test(`Object.prototype[1] = "x";`);
test(`Object.setPrototypeOf(Array.prototype, {1: "x"});`);

// Arrays from another realm use that realm's fuse.
var g = newGlobal({sameCompartmentAs: this});
g.Array.prototype[1] = "x";
assertEq(getFuseState().ArrayProtoHasNoIndexedPropsFuse.intact, true);
assertEq(Array.prototype.join.call(g.eval("[0, , 2]")), "0,x,2");
assertEq(Array.prototype.slice.call(g.eval("[0, , 2]"))[1], "x");
assertEq([0, , 2].join(), "0,,2");
