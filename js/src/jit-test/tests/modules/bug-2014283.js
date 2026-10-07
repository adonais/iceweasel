let ns = null;
import("dynamic-import-function-referrer.js").then(m => {
  ns = m;
});
drainJobQueue();
assertEq(ns.staticValue, 1);

assertEq(getModuleLoadedModules(ns).includes("module1.js"), true);
assertEq(getModuleLoadedModules(ns).includes("module2.js"), false);

let first = null;
ns.importSameSpecifier().then(m => {
  first = m;
});
drainJobQueue();

let second = null;
ns.importSameSpecifier().then(m => {
  second = m;
});
drainJobQueue();

assertEq(first.a, 1);
assertEq(first, second);

let other = null;
ns.importOtherSpecifier().then(m => {
  other = m;
});
drainJobQueue();
assertEq(other.b, 2);

// module2.js is imported dynamically with the referrer that is a function in a
// module.
assertEq(getModuleLoadedModules(ns).includes("module2.js"), true);
