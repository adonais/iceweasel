// |jit-test| skip-if: !wasmStackSwitchingEnabled()

// Test that externref values passed through the cont/tag parameter and result
// areas (resumeArgsArea, contResultsArea, handlersParamsArea,
// suspendResultsArea) survive GC across stack switches. The earlier GC tests
// only cover refs held in frame locals with empty-signature conts/tags; these
// exercise refs marshalled by the typed base frame stub and the suspend/resume
// argument copies.

gczeal(2, 1);

// Section 1: externref cont param + result, with a GC inside the continuation.
// The param flows in via resumeArgsArea and back out via contResultsArea.
{
  let { run } = wasmEvalText(`(module
    (import "env" "gc" (func $gc))
    (type $ft (func (param externref) (result externref)))
    (type $ct (cont $ft))
    (func $f (type $ft)
      call $gc       ;; collect while the param is live in our frame
      local.get 0    ;; return the param as the cont result
    )
    (elem declare func $f)
    (func (export "run") (param externref) (result externref)
      local.get 0
      ref.func $f
      cont.new $ct
      resume $ct
    )
  )`, { env: { gc: () => gc() } }).exports;

  let obj = { id: "param", data: new Array(64).fill(7) };
  let result = run(obj);
  assertEq(result, obj);
  assertEq(result.data[0], 7);
  assertEq(result.data[63], 7);
}

// Section 2: full suspend/resume cycle touching all four areas with externrefs.
//   $arg     -> resumeArgsArea     (cont param, first resume)
//   $p       -> handlersParamsArea (tag param, delivered on suspend)
//   reply()  -> suspendResultsArea (tag result, delivered on re-resume)
//   $r       -> contResultsArea    (cont result, on normal return)
// A gc() runs while the continuation is suspended (refs parked) and again
// inside the continuation after it receives the tag result.
{
  let A = { id: "A", data: new Array(64).fill(1) };
  let B = { id: "B", data: new Array(64).fill(2) };
  let delivered = null;

  let { run } = wasmEvalText(`(module
    (import "env" "gc" (func $gc))
    (import "env" "reply" (func $reply (param externref) (result externref)))
    (type $ft (func (param externref) (result externref)))
    (type $ct (cont $ft))
    (tag $tag (param externref) (result externref))

    (func $f (type $ft)
      (local $r externref)
      local.get 0      ;; deliver the cont param as the tag param
      suspend $tag     ;; ... and receive an externref tag result
      local.set $r
      call $gc         ;; collect while the tag result is live in our frame
      local.get $r     ;; return it as the cont result
    )
    (elem declare func $f)

    (func (export "run") (param $arg externref) (result externref)
      (local $k (ref null $ct))
      (local $got externref)
      (block $on_tag (result externref (ref $ct))
        local.get $arg
        ref.func $f
        cont.new $ct
        resume $ct (on $tag 0)
        unreachable
      )
      local.set $k     ;; the suspended continuation
      local.set $got   ;; the delivered tag param
      call $gc         ;; collect while the continuation is parked
      local.get $got
      call $reply      ;; verify the delivered value, get the reply externref
      local.get $k
      resume $ct       ;; reply travels via resumeArgsArea -> suspendResultsArea
    )
  )`, { env: {
    gc: () => gc(),
    reply: (d) => { delivered = d; return B; },
  } }).exports;

  let result = run(A);
  assertEq(delivered, A);
  assertEq(delivered.data[0], 1);
  assertEq(result, B);
  assertEq(result.data[0], 2);
  assertEq(result.data[63], 2);
}

// Section 3: multiple externref params and results in one area, to catch
// per-slot offset or ref-typing mistakes. The continuation swaps its two
// params and returns them, with a GC in between.
{
  let { run } = wasmEvalText(`(module
    (import "env" "gc" (func $gc))
    (type $ft (func (param externref externref) (result externref externref)))
    (type $ct (cont $ft))
    (func $f (type $ft)
      call $gc
      local.get 1    ;; swap order on the way out
      local.get 0
    )
    (elem declare func $f)
    (func (export "run") (param externref externref) (result externref externref)
      local.get 0
      local.get 1
      ref.func $f
      cont.new $ct
      resume $ct
    )
  )`, { env: { gc: () => gc() } }).exports;

  let a = { id: "a", data: new Array(32).fill(10) };
  let b = { id: "b", data: new Array(32).fill(20) };
  let [r0, r1] = run(a, b);
  assertEq(r0, b);
  assertEq(r1, a);
  assertEq(r0.data[0], 20);
  assertEq(r1.data[0], 10);
}
