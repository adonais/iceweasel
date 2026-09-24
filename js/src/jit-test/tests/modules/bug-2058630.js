// |jit-test| allow-oom; skip-if: !hasFunction.oomAtAllocation || !getBuildConfiguration("source-phase-imports") || !wasmIsSupported() || getBuildConfiguration("release_or_beta"); --enable-source-phase-imports; --enable-source-phase-imports-test262-module-source
const source = 'import source s from "<module source>";';

for (let i = 1; i < 64; i++) {
  const root = registerModule("root", parseModule(source, "root.js"));

  oomAtAllocation(i);
  try {
    moduleLoadAndLink(root);
  } catch {}
  resetOOMFailure();
}
