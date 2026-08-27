let m = parseModule(`
  const root = newGlobal();
  minorgc();
  root.eval();
`);
moduleLoadAndLink(m);
moduleEvaluate(m);
