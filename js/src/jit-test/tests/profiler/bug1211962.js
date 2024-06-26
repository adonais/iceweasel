// |jit-test| slow; skip-if: helperThreadCount() === 0

enableGeckoProfiling();
var lfGlobal = newGlobal();
for (lfLocal in this) {
    lfGlobal[lfLocal] = this[lfLocal];
}
const script = 'oomTest(() => getBacktrace({args: true, locals: "123795", thisprops: true}));';
lfGlobal.offThreadCompileToStencil(script);
var stencil = lfGlobal.finishOffThreadStencil();
lfGlobal.evalStencil(stencil);
