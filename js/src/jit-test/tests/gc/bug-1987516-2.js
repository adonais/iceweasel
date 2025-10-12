// |jit-test| --enable-symbols-as-weakmap-keys; skip-if: getBuildConfiguration("release_or_beta")
try {
  evalInWorker('new WeakRef(Symbol.hasInstance)');
} catch (e) {
  // evalInWorker not supported with --no-threads
  assertEq(e.toString().includes("--no-threads"), true);
}
