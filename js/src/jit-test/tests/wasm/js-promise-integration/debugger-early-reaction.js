// |jit-test| skip-if: !wasmJSPromiseIntegrationEnabled()

// Regression test for bug 2045460:
// A debugger can extract the internal reaction registered on a JSPI suspending
// promise (via Debugger.Object.prototype.getPromiseReactions) and invoke it
// (via Debugger.Object.prototype.call) while that promise is still pending.
// This resumes the suspended continuation early, which used to read the result
// slot of a pending promise and trip an assertion in GetPromiseResults. The
// engine must now fail cleanly instead of asserting/crashing.

var g = newGlobal({newCompartment: true});
var dbg = new Debugger();
var gw = dbg.addDebuggee(g);

g.eval(`
  var resolveFn;
  var userPromise = new Promise(r => { resolveFn = r; });
  var suspending = new WebAssembly.Suspending(() => userPromise);
  var bin = wasmTextToBinary('(module (import "m" "s" (func $s (result externref))) (func (export "f") (result externref) call $s))');
  var inst = new WebAssembly.Instance(new WebAssembly.Module(bin), {m:{s:suspending}});
  var p = WebAssembly.promising(inst.exports.f);
  var settled = false;
  p().then(v => { settled = "resolved"; }, e => { settled = "rejected"; });
`);

var promiseDO = gw.makeDebuggeeValue(g.userPromise);
var reactions = promiseDO.getPromiseReactions();

for (var r of reactions) {
  if (r.resolve) {
    // Resumes the suspended continuation early while userPromise is pending.
    // Must not assert; the early resume is reported as a clean failure.
    r.resolve.call(undefined);
  }
}

drainJobQueue();
print("ok");
