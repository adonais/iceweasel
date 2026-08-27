let a = parseModule(`throw new Error`);
moduleLoadAndLink(a);
stackTest(function() {
    moduleEvaluate(a);
});
