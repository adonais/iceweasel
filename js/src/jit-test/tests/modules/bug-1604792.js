var lfLogBuffer = `
  eval("function f(){}; f();");
`;

let lfMod = parseModule(lfLogBuffer);
moduleLoadAndLink(lfMod);
moduleEvaluate(lfMod);
