async function testAsyncDisposableStackEmpty() {
  {
    await using stack = new AsyncDisposableStack();
  }
}

testAsyncDisposableStackEmpty();
drainJobQueue();
