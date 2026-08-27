globalThis.called = false;

const m = parseModule(`
using x = {
  [Symbol.dispose]() {
    globalThis.called = true;
  }
}
`);

moduleLoadAndLink(m);
moduleEvaluate(m);

assertEq(globalThis.called, true);
