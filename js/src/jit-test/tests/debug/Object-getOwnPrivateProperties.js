// private fields

var g = newGlobal({ newCompartment: true });
var dbg = Debugger();
var gobj = dbg.addDebuggee(g);

g.eval(`
class MyClass {
    constructor() {
        this.publicProperty = 1;
        this.publicSymbol = Symbol("public");
        this[this.publicSymbol] = 2;
        this.#privateProperty1 = 3;
        this.#privateProperty2 = 4;
    }
    static #privateStatic1
    static #privateStatic2
    #privateProperty1
    #privateProperty2
    #privateMethod() {}
    publicMethod(){}
}
obj = new MyClass();
klass = MyClass`);

var dobj = gobj.getOwnPropertyDescriptor("obj").value;
var privateProperties = dobj.getOwnPrivateProperties();

assertEq(
  JSON.stringify(privateProperties.map(w => w.description)),
  JSON.stringify([`#privateProperty1`, `#privateProperty2`])
);

var dklass = gobj.getOwnPropertyDescriptor("klass").value;
var classPrivateProperties = dklass.getOwnPrivateProperties();

assertEq(
  JSON.stringify(classPrivateProperties.map(w => w.description)),
  JSON.stringify([`#privateStatic1`, `#privateStatic2`])
);

// The wrapper is an opaque Debugger.PrivateName object, not the raw private
// name symbol (bug 1917308): handing a private name symbol to a Proxy operation
// would otherwise trip an assertion.
for (var wrapper of privateProperties) {
  assertEq(typeof wrapper, "object");
  assertEq(typeof wrapper === "symbol", false);
}

// The bug's original testcase: using the returned value with `in` on a Proxy
// must no longer assert. The wrapper is an ordinary object, so `in` works.
assertEq(privateProperties[0] in new Proxy({}, {}), false);

// The value of a private field is still reachable by passing the wrapper to
// getOwnPropertyDescriptor.
assertEq(dobj.getOwnPropertyDescriptor(privateProperties[0]).value, 3);
assertEq(dobj.getOwnPropertyDescriptor(privateProperties[1]).value, 4);

// A wrapper from another Debugger still resolves to the same private field
// (no same-owner restriction).
var dbg2 = Debugger();
var gobj2 = dbg2.addDebuggee(g);
var dobj2 = gobj2.getOwnPropertyDescriptor("obj").value;
assertEq(dobj2.getOwnPropertyDescriptor(privateProperties[0]).value, 3);
