// |jit-test| error: TypeError

r = parseModule(`
  for await (var x of this) {}
`);
moduleLoadAndLink(r);
moduleEvaluate(r);
