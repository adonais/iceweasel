let a = parseModule(`throw new Error`);
moduleLoadAndLink(a);
moduleEvaluate(a).catch(e => {});
moduleEvaluate(a).catch(e => {});
