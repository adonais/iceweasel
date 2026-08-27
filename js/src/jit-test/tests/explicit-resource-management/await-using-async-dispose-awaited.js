let catchCalled = false;
async function testAsyncDisposeAwaitUsingAwaited() {
  await using x = {
    [Symbol.asyncDispose]: () => Promise.reject('async')
  };
}
testAsyncDisposeAwaitUsingAwaited().catch((e) => {
  catchCalled = true;
  assertEq(e, 'async');
});
drainJobQueue();
assertEq(catchCalled, true);
