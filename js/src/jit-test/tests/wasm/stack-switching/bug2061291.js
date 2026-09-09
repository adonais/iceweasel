// |jit-test| skip-if: !wasmStackSwitchingEnabled()

// Test a cont base frame callee doing a return_call_indirect which traps,
// where the callee frame is the only thing keeping the instance alive.

const runner = wasmEvalText(`(module
  (type $ft (func))
  (type $ct (cont $ft))
  (table $t (export "t") 1 (ref null $ft))
  (global $k (mut (ref null $ct)) (ref.null $ct))
  (func (export "capture")
    (global.set $k (cont.new $ct (table.get $t (i32.const 0))))
    (table.set $t (i32.const 0) (ref.null $ft)))
  (func (export "run")
    (resume $ct (global.get $k))))`);

let entry = wasmEvalText(`(module
  (type $ft (func))
  (type $mismatched (func (param i32)))
  (table $t 1 funcref)
  (func $callee (type $mismatched))
  (elem (i32.const 0) func $callee)
  (func (export "f")
    (i32.const 0)
    (return_call_indirect $t (type $ft))))`);

runner.exports.t.set(0, entry.exports.f);
runner.exports.capture();

// capture() cleared the table, so this drops the last reference to the entry
// function's instance.
entry = null;

// Make the trap's error object allocation sweep and compact.
gczeal(14, 1);

assertErrorMessage(() => runner.exports.run(), WebAssembly.RuntimeError,
                   /indirect call signature mismatch/);
