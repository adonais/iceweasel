// |jit-test| skip-if: !wasmJSPromiseIntegrationEnabled()

// Regression test for bug 2044834:
// Debugger.Frames with onPop hooks on a suspended wasm continuation must not
// be treated as GC roots via traceFramesWithLiveHooks, which would assert
// during runtime-shutdown GC (checkNoRuntimeRoots).

var g = newGlobal({newCompartment: true});
Debugger(g).onEnterFrame = function(f) {
  f.onPop = function() {};
};

g.eval(`
  var bin = wasmTextToBinary(\`(module
    (import "" "susp" (func $susp))
    (func $c (call $susp))
    (func $d (call $c))
    (func (export "outer") (call $d))
  )\`);
  var susp = new WebAssembly.Suspending(() => new Promise(() => {}));
  var inst = new WebAssembly.Instance(new WebAssembly.Module(bin),
                                      {"": {susp}});
  WebAssembly.promising(inst.exports.outer)();
`);

print("ok");
