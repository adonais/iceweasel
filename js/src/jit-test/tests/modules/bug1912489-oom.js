// |jit-test| skip-if: !('oomTest' in this)

ignoreUnhandledRejections();

oomTest(() => {
  clearModules();
  registerModule("dep", parseModule("await 1;"));
  const mod = registerModule("top", parseModule('import {} from "dep"; await 1;'));
  moduleLoadAndLink(mod);
  moduleEvaluate(mod);
  drainJobQueue();
});
