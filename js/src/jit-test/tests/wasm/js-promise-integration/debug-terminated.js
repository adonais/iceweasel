// |jit-test| skip-if: !wasmJSPromiseIntegrationEnabled()

// A wasm frame suspended on a JSPI continuation is resumable, so it must report
// terminated === false (not terminated). Regression test for bug 2045497.

var g = newGlobal({ newCompartment: true });
var dbg = new Debugger(g);
var frames = [];
dbg.onEnterFrame = f => {
  if (f.type === "wasmcall") {
    frames.push(f);
  }
};

g.eval(`
  var bin = wasmTextToBinary(\`(module
    (import "" "s" (func $s))
    (func (export "f") (call $s)))\`);
  var resolver;
  var susp = new WebAssembly.Suspending(() => new Promise(r => { resolver = r; }));
  var inst = new WebAssembly.Instance(new WebAssembly.Module(bin), {"": {s: susp}});
  WebAssembly.promising(inst.exports.f)();
`);

var f = frames[0];
// Suspended continuation: not on stack, but resumable and therefore not
// terminated.
assertEq(f.onStack, false);
assertEq(f.terminated, false);

var ranAgain = false;
f.onStep = () => { ranAgain = true; };
g.eval("resolver();");
drainJobQueue();

// The frame resumed and ran again, confirming it was not terminated.
assertEq(ranAgain, true);
// After completing, the frame is now permanently terminated.
assertEq(f.terminated, true);
assertEq(f.onStack, false);
