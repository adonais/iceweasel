// |jit-test| skip-if: !wasmStackSwitchingEnabled()

const target = wasmEvalText(`(module
  (func (export "trap") (param i32) (result i32) unreachable))`).exports;
const runner = wasmEvalText(`(module
  (type $ft (func (result i32)))
  (type $ct (cont $ft))
  (table $table (export "table") 1 (ref null $ft))
  (global $k (mut (ref null $ct)) (ref.null $ct))
  (func (export "capture")
    (global.set $k (cont.new $ct (table.get $table (i32.const 0))))
    (table.set $table (i32.const 0) (ref.null $ft)))
  (func (export "run") (result i32) (resume $ct (global.get $k))))`).exports;
let entry = wasmEvalText(`(module
  (import "" "target" (func $target (param i32) (result i32)))
  (func (export "run") (result i32) (return_call $target (i32.const 1))))`,
  {"": {target: target.trap}}).exports;
runner.table.set(0, entry.run);
runner.capture();
entry = null;
gczeal(14, 1);
assertErrorMessage(() => runner.run(), WebAssembly.RuntimeError, /unreachable/);
