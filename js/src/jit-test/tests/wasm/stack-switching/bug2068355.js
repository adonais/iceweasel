// |jit-test| skip-if: !wasmStackSwitchingEnabled()

// Test resuming a continuation whose initial function ends in a return_call and
// returns a reference-typed stack result.
let ins = wasmEvalText(`(module
  (type $s (struct (field i32)))
  (type $ft (func (result (ref null $s) i32)))
  (type $ct (cont $ft))
  (type $gt (func (param i64 i64 i64 i64 i64 i64 i64 i64)
                  (result (ref null $s) i32)))
  (func $g (type $gt) ref.null $s i32.const 1)
  (func $f (type $ft)
    i64.const 0 i64.const 0 i64.const 0 i64.const 0 i64.const 0 i64.const 0
    i64.const 0x1234 i64.const 0x1234
    return_call $g)
  (elem declare func $f)
  (func (export "run") (result anyref)
    ref.func $f
    cont.new $ct
    resume $ct
    drop))`);

assertEq(ins.exports.run(), null);
