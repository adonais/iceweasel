load(libdir + "asserts.js");

globalThis.callOrder = [];

const m = parseModule(`
using x = {
  [Symbol.dispose]() {
    globalThis.callOrder.push("x");
  }
}

using y = {
  [Symbol.dispose]() {
    globalThis.callOrder.push("y");
  }
}
`);

moduleLoadAndLink(m);
moduleEvaluate(m);

assertArrayEq(globalThis.callOrder, ["y", "x"]);
