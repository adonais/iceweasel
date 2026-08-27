// |jit-test| --fast-warmup;--blinterp-warmup-threshold=10
ignoreUnhandledRejections();

oomTest(async function() {
    let m = parseModule(``);
    moduleLoadAndLink(m);
    await moduleEvaluate(m);
});
