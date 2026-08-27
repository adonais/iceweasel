load(libdir + "asserts.js");

globalThis.disposed = [];

const m = parseModule(`
  await using x = {
    [Symbol.asyncDispose]() {
      globalThis.disposed.push(1);
    }
  }
  await using y = {
    [Symbol.asyncDispose]() {
      globalThis.disposed.push(2);
    }
  }
`);

moduleLoadAndLink(m);
moduleEvaluate(m);
drainJobQueue();
assertArrayEq(globalThis.disposed, [2, 1]);
