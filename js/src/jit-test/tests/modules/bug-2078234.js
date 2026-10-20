let ns = null;
import("dynamic-import-repeated-referrer.js").then(m => {
  ns = m;
});
drainJobQueue();

assertEq(getModuleLoadedModules(ns).length, 0);

ns.run(1000);
drainJobQueue();
assertEq(getModuleLoadedModules(ns).length, 1);
assertEq(getModuleLoadedModules(ns)[0], "module1.js");

ns.runOther(1000);
drainJobQueue();
assertEq(getModuleLoadedModules(ns).length, 2);
assertEq(getModuleLoadedModules(ns).includes("module2.js"), true);
