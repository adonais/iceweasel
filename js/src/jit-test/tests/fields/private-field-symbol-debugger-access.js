// Make a new global to debug
const global = newGlobal({ newCompartment: true });

// Create an object in that global with a private field.
global.eval("\nclass MyClass {\n #privateProperty1\n }\nobj = new MyClass();");

// Debug said global.
const debug = Debugger();
const globalDebugObject = debug.addDebuggee(global);

// getOwnPrivateProperties must not leak the raw private name symbol backing the
// private field; it returns an opaque Debugger.PrivateName wrapper instead (see
// bug 1917308). Handing a raw private name symbol to a proxy used to crash, as
// it violated the assumption baked into the proxy code that all accesses are
// scripted, and thus creation and symbol management invariants are correctly
// observed.
var otherGlobalObj = globalDebugObject.getOwnPropertyDescriptor("obj").value;
var privateName = otherGlobalObj.getOwnPrivateProperties()[0];

// The wrapper is an ordinary object, not a symbol.
assertEq(typeof privateName, "object");
assertEq(typeof privateName === "symbol", false);

// Using the wrapper with a proxy must not crash or throw: it is just an
// ordinary object key.
var p = new Proxy({}, {});
p[privateName] = 1;
assertEq(privateName in p, true);
