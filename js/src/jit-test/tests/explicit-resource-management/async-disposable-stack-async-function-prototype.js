assertEq(Object.getPrototypeOf(AsyncDisposableStack.prototype.disposeAsync) === Function.prototype, true);
assertEq(Object.getPrototypeOf(AsyncDisposableStack.prototype[Symbol.asyncDispose]) === Function.prototype, true);
