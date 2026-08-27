oomTest(function() {
    m = parseModule(`while (x && NaN) prototype; let x`);
    moduleLoadAndLink(m);
    moduleEvaluate(m);
})
