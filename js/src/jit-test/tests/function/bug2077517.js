function F() {}
Object.defineProperty(F, Symbol.hasInstance, { value: () => true });
var bound = F.bind();
var hasInstance = Function.prototype[Symbol.hasInstance];
assertEq(hasInstance.call(bound, undefined), true);
assertEq(hasInstance.call(bound), true);
