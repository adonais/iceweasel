// |jit-test| --fast-warmup; --no-threads

// Test the guards on newTarget's .prototype when constructing scripted
// functions. If .prototype is non-writable, we guard on the identity of
// newTarget instead of the value of .prototype.

// SuperCall to a base class constructor, with a different newTarget for each
// subclass.
function testSuperCallVaryingNewTarget() {
  class Base {
    constructor() {
      this.x = 1;
    }
  }
  class Mid extends Base {
    constructor() {
      super();
    }
  }
  class A extends Mid {}
  class B extends Mid {}
  class C extends Mid {}
  class D extends Mid {}
  var classes = [A, B, C, D];

  for (var i = 0; i < 250; i++) {
    var K = i < 150 ? classes[i % 2] : classes[i % 4];
    var o = new K();
    assertEq(Object.getPrototypeOf(o), K.prototype);
    assertEq(o.x, 1);
  }
}
testSuperCallVaryingNewTarget();

// Constructing clones of the same function. The first stub guards on the
// callee's identity, later stubs guard on its BaseScript.
function testClones(makeFun) {
  var funs = [makeFun(), makeFun(), makeFun(), makeFun()];

  for (var i = 0; i < 250; i++) {
    var F = i < 150 ? funs[i % 2] : funs[i % 4];
    var o = new F();
    assertEq(Object.getPrototypeOf(o), F.prototype);
    assertEq(o.x, 1);
  }
}

function makeClass() {
  return class {
    constructor() {
      this.x = 1;
    }
  };
}
function makeFrozenFunction() {
  var f = function() {
    this.x = 1;
  };
  Object.freeze(f);
  assertEq(Object.getOwnPropertyDescriptor(f, "prototype").writable, false);
  return f;
}
function makeFunction() {
  return function() {
    this.x = 1;
  };
}
testClones(makeClass);
testClones(makeFrozenFunction);
testClones(makeFunction);

// Same as above, but construct bound functions whose targets are clones.
function testBoundClones(makeFun) {
  var funs = [makeFun(), makeFun(), makeFun(), makeFun()];
  var bound = funs.map(f => f.bind(null));

  for (var i = 0; i < 250; i++) {
    var j = i < 150 ? i % 2 : i % 4;
    var o = new bound[j]();
    assertEq(Object.getPrototypeOf(o), funs[j].prototype);
    assertEq(o.x, 1);
  }
}
testBoundClones(makeClass);
testBoundClones(makeFrozenFunction);
testBoundClones(makeFunction);

// Writable .prototype that changes after the stub is attached.
function testWritablePrototype() {
  function F() {
    this.x = 1;
  }
  var proto1 = F.prototype;
  var proto2 = {};

  for (var i = 0; i < 250; i++) {
    if (i === 150) {
      F.prototype = proto2;
    }
    var o = new F();
    assertEq(Object.getPrototypeOf(o), i < 150 ? proto1 : proto2);
    assertEq(o.x, 1);
  }
}
testWritablePrototype();
