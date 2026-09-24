// Regression test for a use-after-free of wasm code.
//
// A `return_call` into a JS import collapses the calling frame but keeps
// running that caller's import exit stub until the import returns. The exit
// stub lives in the caller instance's code, so the caller instance must stay
// alive for the duration even though, after the frame collapse, no frame on
// the stack reports it. If GC frees the instance while the import runs,
// execution returns through freed (and possibly reclaimed) executable memory.
//
// The import here drops the last reference to the tail-calling instance and
// forces a collection; the subsequent return into the exit stub must remain
// valid.

var table = new WebAssembly.Table({element: "anyfunc", initial: 1});

// Reaches the tail-calling instance indirectly, so its own frame is the only
// thing that would keep it alive during the call, and the tail call throws
// that frame away.
var driver = wasmEvalText(`(module
  (import "m" "table" (table 1 funcref))
  (type $t (func (result i32)))
  (func (export "f") (result i32)
    i32.const 0
    call_indirect (type $t))
)`, {m: {table}}).exports.f;

var armed = false;
var pressure = [];

function go() {
  if (!armed) {
    return 42;
  }
  // Drop the last reference to the tail-calling instance and collect it.
  table.set(0, null);
  gc();
  return 42;
}

function install() {
  var ins = wasmEvalText(`(module
    (import "m" "go" (func $go (result i32)))
    (func (export "f") (result i32)
      return_call $go)
  )`, {m: {go}});
  table.set(0, ins.exports.f);
  // `ins` is now unreachable except through table[0].
}

install();

// Warm up without arming so any lazy stubs are generated first.
assertEq(driver(), 42);

armed = true;
assertEq(driver(), 42);
