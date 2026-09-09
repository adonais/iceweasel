// Verify that a dynamic import is evaluated asynchronously: the imported
// module must not be linked or evaluated while the importing script is still
// running.

globalThis.sideEffectEvaluated = false;

let order = [];

import("dynamic-import-side-effect.js").then(ns => {
    order.push("resolved");
    assertEq(ns.a, 1);
});

assertEq(sideEffectEvaluated, false);
order.push("sync");

drainJobQueue();

assertEq(sideEffectEvaluated, true);
assertEq(order.join(), "sync,resolved");
