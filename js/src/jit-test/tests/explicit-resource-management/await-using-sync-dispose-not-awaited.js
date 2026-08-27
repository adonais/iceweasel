// |jit-test| error:Unhandled rejection: "sync"

let fulfilled = false;
async function testSyncDisposeAwaitUsingNotAwaited() {
  await using x = {
    [Symbol.dispose]: () => Promise.reject('sync')
  };
}
testSyncDisposeAwaitUsingNotAwaited().then(() => {
  fulfilled = true;
});
drainJobQueue();
// Returning a rejected from the sync dispose shouldn't reject.
assertEq(fulfilled, true);
