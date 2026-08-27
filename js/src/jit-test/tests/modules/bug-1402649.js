loadFile(`
function parseAndEvaluate(source) {
    let m = parseModule(source);
    moduleLoadAndLink(m);
}
parseAndEvaluate("async function a() { await 2 + 3; }")
`);
function loadFile(lfVarx) {
    oomTest(function() {
        eval(lfVarx);
    });
}
