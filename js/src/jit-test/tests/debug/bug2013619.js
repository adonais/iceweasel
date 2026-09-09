// |jit-test| skip-if: !wasmDebuggingEnabled()

// Trigger crash via wasm trap with debug frames containing externref.
// The trap handling goes through signal handler -> HandleExceptionWasm.
// During exception unwinding, the DebugFrame's externref locals need
// to be properly handled. If getLocal reads a local after the frame
// has been partially unwound or the trap has corrupted frame state,
// we could get a use-after-free.
setJitCompilerOption("wasm.optimizing", 0);

var g = newGlobal({newCompartment: true});
var dbg = new Debugger(g);

g.evaluate(`
  var bytes = wasmTextToBinary(
    '(module ' +
    '  (type $S (struct (field i32)))' +
    '  (func (export "mkS") (result structref)' +
    '    struct.new_default $S' +
    '  )' +
    '  (func $zero (export "zero") (param structref)' +
    '    (unreachable)' +
    '  )' +
    '  (func $one (export "one") (param structref)' +
    '    (local.get 0) (call $zero)' +
    '  )' +
    '  (func $two (export "two") (param structref)' +
    '    (local.get 0) (call $one)' +
    '  )' +
    '  (func $three (export "three") (param structref)' +
    '    (local.get 0) (call $two)' +
    '  )' +
    ')'
  );
  var mod = new WebAssembly.Module(bytes);
  var instance = new WebAssembly.Instance(mod, {});
  var testTrap = instance.exports.three;
  var mkS = instance.exports.mkS;
`);

dbg.onExceptionUnwind = function(frame, exc) {
  if (frame.type !== "wasmcall") return;

  // Force GC while accessing frame during unwind
  gc();

  // Try to access locals again after GC
  try {
    var env = frame.environment;
    if (env) {
      var names = env.names();
      for (var n of names) {
        var val = env.getVariable(n);
      }
    }
  } catch(e) {}
};

// Test unreachable trap
try {
  var obj1 = g.mkS();
  g.testTrap(obj1);
} catch(e) {}
