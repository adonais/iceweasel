globalThis.disposed = false;

const m = parseModule(`
  using x = {
    [Symbol.dispose]() {
      globalThis.disposed = true;
    }
  }
  throw new Error("err");
`);

moduleLoadAndLink(m);
moduleEvaluate(m).catch(() => 0);

assertEq(globalThis.disposed, true);
