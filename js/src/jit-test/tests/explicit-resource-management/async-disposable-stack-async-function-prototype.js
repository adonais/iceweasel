// |jit-test| skip-if: !getBuildConfiguration("explicit-resource-management"); --enable-explicit-resource-management

assertEq(Object.getPrototypeOf(AsyncDisposableStack.prototype.disposeAsync) === Function.prototype, true);
assertEq(Object.getPrototypeOf(AsyncDisposableStack.prototype[Symbol.asyncDispose]) === Function.prototype, true);
