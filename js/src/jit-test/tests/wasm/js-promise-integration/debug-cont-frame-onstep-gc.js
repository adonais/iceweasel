// |jit-test| skip-if: !wasmJSPromiseIntegrationEnabled()

// When a Debugger.Frame for a wasm continuation frame has an onStep handler
// and the wasm instance is collected in the same GC as the ContObject,
// frame termination must not consult GC mark state during finalization.

var g = newGlobal({newCompartment: true});
var dbg = new Debugger(g);
dbg.onEnterFrame = function(f) {
  if (f.type === "wasmcall") {
    f.onStep = function() {};
  }
};

g.eval(`
  var never = new WebAssembly.Suspending(() => new Promise(() => {}));
  var inst = new WebAssembly.Instance(new WebAssembly.Module(wasmTextToBinary(\`(module
    (import "" "susp" (func $susp))
    (func (export "outer") (call $susp))
  )\`)), {"":{susp: never}});
  WebAssembly.promising(inst.exports.outer)();
  inst = null; never = null;
`);

dbg.onEnterFrame = undefined;
gc(); gc(); gc();
print("ok");
