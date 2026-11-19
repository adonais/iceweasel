// |jit-test| allow-oom; skip-if: !hasFunction.oomAtAllocation
function f() {
  for (var i = 0; i < 9 ; i++) {}
}
f();
oomAtAllocation(2);
recordIonCompilationForHints(f);
