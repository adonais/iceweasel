// |jit-test| skip-if: !wasmStackSwitchingEnabled()

// Regression test for a register-clobber bug in the continuation base frame
// stub (GenerateContBaseFrameStub) on x86/x64.
//
// When a continuation function returns normally, the stub copies its results
// into the resumer's returnTarget paramsArea, iterating in source order. With
// MaxRegisterResults == 1, only the *last* declared result is returned in a
// register; all earlier results are stack results. The stub shuffles GPR/ref
// stack results through scratch1 (== ReturnReg on x86/x64: ABINonArgReg0 ==
// rax/eax), and the register result is stored last. So a leading GPR/ref stack
// result clobbers the pending register result before it is written out.
//
// These cases all end in a GPR-class result (i32/i64/ref) preceded by at least
// one GPR/ref stack result, which is the trigger. Before the fix, on x86/x64 the
// last value came back equal to an earlier one (the stub now shuffles stack
// results through a return-safe scratch instead). Cases ending in an FP register
// result (e.g. the i32/i64/f64 test in cont-params.js) do not trip it.

// Two i32 results: result[0] stack, result[1] in a register.
{
  let { run } = wasmEvalText(`(module
    (type $ft (func (result i32 i32)))
    (type $ct (cont $ft))
    (func $f (type $ft)
      i32.const 0x11111111
      i32.const 0x22222222
    )
    (elem declare func $f)
    (func (export "run") (result i32 i32)
      ref.func $f
      cont.new $ct
      resume $ct
    )
  )`).exports;
  let [a, b] = run();
  assertEq(a, 0x11111111 | 0);
  assertEq(b, 0x22222222 | 0);
}

// Three i32 results: result[0] and result[1] stack, result[2] in a register.
{
  let { run } = wasmEvalText(`(module
    (type $ft (func (result i32 i32 i32)))
    (type $ct (cont $ft))
    (func $f (type $ft)
      i32.const 0x11111111
      i32.const 0x22222222
      i32.const 0x33333333
    )
    (elem declare func $f)
    (func (export "run") (result i32 i32 i32)
      ref.func $f
      cont.new $ct
      resume $ct
    )
  )`).exports;
  let [a, b, c] = run();
  assertEq(a, 0x11111111 | 0);
  assertEq(b, 0x22222222 | 0);
  assertEq(c, 0x33333333 | 0);
}

// Two i64 results: on x64 the register result is ReturnReg64 (== rax), which the
// leading i64 stack result clobbers; on x86 it clobbers the low half (eax).
{
  let { run } = wasmEvalText(`(module
    (type $ft (func (result i64 i64)))
    (type $ct (cont $ft))
    (func $f (type $ft)
      i64.const 0x1111111111111111
      i64.const 0x2222222222222222
    )
    (elem declare func $f)
    (func (export "run") (result i64 i64)
      ref.func $f
      cont.new $ct
      resume $ct
    )
  )`).exports;
  let [a, b] = run();
  assertEq(a, 0x1111111111111111n);
  assertEq(b, 0x2222222222222222n);
}

// Two externref results carried through as params: result[0] stack, result[1]
// in a register. Distinct objects make the clobber observable.
{
  let { run } = wasmEvalText(`(module
    (type $ft (func (param externref externref) (result externref externref)))
    (type $ct (cont $ft))
    (func $f (type $ft)
      local.get 0
      local.get 1
    )
    (elem declare func $f)
    (func (export "run") (param externref externref) (result externref externref)
      local.get 0
      local.get 1
      ref.func $f
      cont.new $ct
      resume $ct
    )
  )`).exports;
  let objA = { tag: "A" };
  let objB = { tag: "B" };
  let [a, b] = run(objA, objB);
  assertEq(a, objA);
  assertEq(b, objB);
}
