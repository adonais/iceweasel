// |jit-test| --enable-symbols-as-weakmap-keys; skip-if: getBuildConfiguration("release_or_beta")
try {
  evalInWorker(`
    function a() {}
    b = function() {}
    c = new FinalizationRegistry(b);
    a(c.register(Symbol.hasInstance));
  `);
} catch (e) {
  // evalInWorker not supported with --no-threads
  assertEq(e.toString().includes("--no-threads"), true);
}
