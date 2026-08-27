globalThis.disposed = false;

const m = parseModule(`
  await using x = {
    [Symbol.asyncDispose]() {
      globalThis.disposed = true;
    }
  }
  throw new Error("err");
`);

moduleLoadAndLink(m);
moduleEvaluate(m).catch(() => 0);
drainJobQueue();

assertEq(globalThis.disposed, true);
