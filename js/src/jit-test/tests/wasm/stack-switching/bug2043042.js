// |jit-test| skip-if: !wasmStackSwitchingEnabled()

// Regression test for a return_call_indirect signature mismatch in the *entry*
// function of a continuation stack.
//
// The bad-signature trap tears down the entry function's frame, leaving the
// unwound PC inside the ContBaseFrame stub (not a Function CodeRange). Frame
// iteration must switch to the resume target on the parent stack instead of
// dereferencing a null CodeRange, and exception unwinding must free the
// continuation stack even though no frame is reported on it.

const PRELUDE = `
  (type $ft (func))
  (type $ct (cont $ft))
`;

// Basic case: the continuation's entry function tail-calls through a table
// entry whose signature does not match. The trap must surface to the JS caller
// as a RuntimeError rather than crashing.
{
  let run = wasmEvalText(`(module
    ${PRELUDE}
    (type $bad (func (param i32)))
    (table 1 funcref)
    (func $g (type $bad))
    (elem (i32.const 0) func $g)
    (func $f (type $ft)
      i32.const 0
      return_call_indirect (type $ft)
    )
    (elem declare func $f)
    (func (export "run")
      ref.func $f
      cont.new $ct
      resume $ct
    )
  )`).exports.run;
  assertErrorMessage(() => run(), WebAssembly.RuntimeError,
                     /indirect call signature mismatch/);
}

// Repeat many times: each trap allocates and must free its continuation stack
// during exception unwinding. A leak or use-after-free of the unwound stack
// would manifest here (especially under ASAN / debug assertions).
{
  let run = wasmEvalText(`(module
    ${PRELUDE}
    (type $bad (func (param i32)))
    (table 1 funcref)
    (func $g (type $bad))
    (elem (i32.const 0) func $g)
    (func $f (type $ft)
      i32.const 0
      return_call_indirect (type $ft)
    )
    (elem declare func $f)
    (func (export "run")
      ref.func $f
      cont.new $ct
      resume $ct
    )
  )`).exports.run;
  for (let i = 0; i < 1000; i++) {
    assertErrorMessage(() => run(), WebAssembly.RuntimeError,
                       /indirect call signature mismatch/);
  }
}

// The mismatch happens after a suspend/resume round-trip, so the bad
// return_call_indirect tears down the entry frame only after the continuation
// stack has already been switched away from and back to.
{
  let { start, step } = wasmEvalText(`(module
    ${PRELUDE}
    (type $bad (func (param i32)))
    (tag $tag)
    (table 1 funcref)
    (global $k (mut (ref null $ct)) (ref.null $ct))
    (func $g (type $bad))
    (elem (i32.const 0) func $g)
    (func $f (type $ft)
      suspend $tag
      i32.const 0
      return_call_indirect (type $ft)
    )
    (elem declare func $f)
    (func (export "start")
      ref.func $f
      cont.new $ct
      global.set $k
    )
    (func (export "step")
      (block (result (ref $ct))
        global.get $k
        resume $ct (on $tag 0)
        return
      )
      global.set $k
    )
  )`).exports;

  start();
  step();
  assertErrorMessage(() => step(), WebAssembly.RuntimeError,
                     /indirect call signature mismatch/);
}

// Nested continuations: an inner continuation's entry function does the bad
// return_call_indirect while running on top of an outer continuation. The
// RuntimeError must propagate out through both stacks to the JS caller.
{
  let run = wasmEvalText(`(module
    ${PRELUDE}
    (type $bad (func (param i32)))
    (table 1 funcref)
    (func $g (type $bad))
    (elem (i32.const 0) func $g)
    (func $inner (type $ft)
      i32.const 0
      return_call_indirect (type $ft)
    )
    (elem declare func $inner)
    (func $outer (type $ft)
      ref.func $inner
      cont.new $ct
      resume $ct
    )
    (elem declare func $outer)
    (func (export "run")
      ref.func $outer
      cont.new $ct
      resume $ct
    )
  )`).exports.run;
  assertErrorMessage(() => run(), WebAssembly.RuntimeError,
                     /indirect call signature mismatch/);
}

// After the trap is handled, the engine must remain in a consistent state:
// a subsequent, well-behaved continuation runs to completion.
{
  let { bad, good, result } = wasmEvalText(`(module
    ${PRELUDE}
    (type $bad_ty (func (param i32)))
    (table 1 funcref)
    (global $r (mut i32) (i32.const 0))
    (func $g (type $bad_ty))
    (elem (i32.const 0) func $g)
    (func $f_bad (type $ft)
      i32.const 0
      return_call_indirect (type $ft)
    )
    (elem declare func $f_bad)
    (func $f_good (type $ft)
      i32.const 42
      global.set $r
    )
    (elem declare func $f_good)
    (func (export "bad")
      ref.func $f_bad
      cont.new $ct
      resume $ct
    )
    (func (export "good")
      ref.func $f_good
      cont.new $ct
      resume $ct
    )
    (func (export "result") (result i32) global.get $r)
  )`).exports;
  assertErrorMessage(() => bad(), WebAssembly.RuntimeError,
                     /indirect call signature mismatch/);
  good();
  assertEq(result(), 42);
}

// Cross-instance: instance A does cont.new on a function imported from instance
// B, so the ContBaseFrame stub belongs to A while the first (and only) real
// frame to run on the stack belongs to B. When B's entry function does the bad
// return_call_indirect, the unwound PC sits in A's stub, but the frame's
// effective instance is B. Frame iteration and trap setup must not assume the
// stub and the entry frame share a Code/instance.
{
  let b = wasmEvalText(`(module
    (type $ft (func))
    (type $bad (func (param i32)))
    (table 1 funcref)
    (func $g (type $bad))
    (elem (i32.const 0) func $g)
    (func (export "f") (type $ft)
      i32.const 0
      return_call_indirect (type $ft)
    )
  )`).exports;

  let run = wasmEvalText(`(module
    ${PRELUDE}
    (import "b" "f" (func $f (type $ft)))
    (elem declare func $f)
    (func (export "run")
      ref.func $f
      cont.new $ct
      resume $ct
    )
  )`, { b: { f: b.f } }).exports.run;
  assertErrorMessage(() => run(), WebAssembly.RuntimeError,
                     /indirect call signature mismatch/);
}

// Same cross-instance setup, but instance B performs the resume: A does
// cont.new on B's imported function and hands the continuation to B, which
// resumes it. The stub is still A's while the running frame is B's.
{
  let b = wasmEvalText(`(module
    ${PRELUDE}
    (type $bad (func (param i32)))
    (table 1 funcref)
    (func $g (type $bad))
    (elem (i32.const 0) func $g)
    (func (export "f") (type $ft)
      i32.const 0
      return_call_indirect (type $ft)
    )
    (func (export "resumeIt") (param $k (ref $ct))
      local.get $k
      resume $ct
    )
  )`).exports;

  let run = wasmEvalText(`(module
    ${PRELUDE}
    (import "b" "f" (func $f (type $ft)))
    (import "b" "resumeIt" (func $resumeIt (param (ref $ct))))
    (elem declare func $f)
    (func (export "run")
      ref.func $f
      cont.new $ct
      call $resumeIt
    )
  )`, { b: { f: b.f, resumeIt: b.resumeIt } }).exports.run;
  assertErrorMessage(() => run(), WebAssembly.RuntimeError,
                     /indirect call signature mismatch/);
}
