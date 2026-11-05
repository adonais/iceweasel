// |jit-test| skip-if: helperThreadCount() === 0

evalInWorker(`
  let x = new WeakMap;
  var y = {};
  x.set(Function, y);
  y = new WeakMap().set(y, "");
  gc();
`);
