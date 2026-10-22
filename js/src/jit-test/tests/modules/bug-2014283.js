// |jit-test| skip-if: isLcovEnabled()

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

evaluate(`function importFromScript() { return import("module1.js"); }`,
         {fileName: "referrer.js"});
assertEq(isLazyFunction(importFromScript), true);

let fromScript = null;
importFromScript().then(ns => { fromScript = ns; });
assertEq(isRelazifiableFunction(importFromScript), true);

relazifyFunctions();

assertEq(isLazyFunction(importFromScript), true);
assertEq(fromScript, null);

drainJobQueue();
assertEq(fromScript.a, 1);

let referrerModule = null;
import("dynamic-import-relazifiable-referrer.js").then(ns => {
  referrerModule = ns;
});
drainJobQueue();
assertEq(isLazyFunction(importFromModule), true);

let fromModule = null;
importFromModule().then(ns => { fromModule = ns; });
assertEq(isRelazifiableFunction(importFromModule), true);

relazifyFunctions();

assertEq(isLazyFunction(importFromModule), true);
assertEq(fromModule, null);

drainJobQueue();
assertEq(fromModule.b, 2);
assertEq(getModuleLoadedModules(referrerModule).includes("module2.js"), true);
