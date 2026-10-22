// |jit-test| skip-if: !wasmStackSwitchingEnabled()

// A continuation's initial function return_calls a function of another
// instance, which is then the only thing referencing the initial function's
// instance.

const tags = wasmEvalText(`(module (tag (export "t")))`).exports;

const target = wasmEvalText(`(module
  (import "" "t" (tag $t))
  (import "" "collect" (func $collect))
  (func (export "gc") (result i32) call $collect i32.const 42)
  (func (export "suspend") (result i32) suspend $t i32.const 43))`,
  {"": {t: tags.t, collect() { gc(); }}}).exports;

for (const name of ["gc", "suspend"]) {
  const runner = wasmEvalText(`(module
    (import "" "t" (tag $t))
    (type $ft (func (result i32)))
    (type $ct (cont $ft))
    (table $table (export "table") 1 (ref null $ft))
    (global $k (mut (ref null $ct)) (ref.null $ct))
    (func (export "capture")
      (global.set $k (cont.new $ct (table.get $table (i32.const 0))))
      (table.set $table (i32.const 0) (ref.null $ft)))
    (func (export "run") (result i32)
      (block $h (result (ref $ct))
        (return (resume $ct (on $t $h) (global.get $k))))
      global.set $k
      i32.const -1)
    (func (export "finish") (result i32)
      (resume $ct (global.get $k))))`, {"": {t: tags.t}}).exports;

  let entry = wasmEvalText(`(module
    (import "" "target" (func $target (result i32)))
    (func (export "run") (result i32) return_call $target))`,
    {"": {target: target[name]}}).exports;

  runner.table.set(0, entry.run);
  runner.capture();
  // capture() cleared the table, so this drops the last reference to the entry
  // function's instance.
  entry = null;

  if (name == "gc") {
    assertEq(runner.run(), 42);
  } else {
    assertEq(runner.run(), -1);
    gc();
    minorgc();
    assertEq(runner.finish(), 43);
  }
}
