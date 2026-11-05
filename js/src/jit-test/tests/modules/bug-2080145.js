const root = parseModule('export function load() { return import("audit-module"); }');
moduleLoadAndLink(root);
moduleEvaluate(root);
const load = getModuleEnvironmentValue(root, 'load');
registerModule('audit-module', parseModule(''));
load();

let threw = false;
try {
  registerModule('audit-module', parseModule(''));
} catch (e) {
  threw = true;
}
assertEq(threw, true);

load();
drainJobQueue();
