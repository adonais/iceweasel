// |jit-test| skip-if: helperThreadCount() === 0

evalInWorker(`
    let m = parseModule("import.meta;");
    moduleLoadAndLink(m);
    moduleEvaluate(m);
`);
