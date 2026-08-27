// |jit-test| error: Error
let m = parseModule(`for (var x of iterator) {}`);
moduleLoadAndLink(m);
try { moduleEvaluate(m); } catch (e) {}
getModuleEnvironmentValue(m, "r");
