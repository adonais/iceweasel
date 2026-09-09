// |jit-test| skip-if: !wasmStackSwitchingEnabled()

// Tests for cont.new/resume with non-empty cont types (params and results) and
// suspend with tag results. These cover the cases needed to run Kotlin
// stack-switching Wasm output.

// Section 1: cont.new + resume with cont params and results (no suspend)

// Simplest case: cont takes one i32 param and returns i32
{
  let { run } = wasmEvalText(`(module
    (type $ft (func (param i32) (result i32)))
    (type $ct (cont $ft))
    (func $f (type $ft)
      local.get 0
      i32.const 1
      i32.add
    )
    (elem declare func $f)
    (func (export "run") (param i32) (result i32)
      local.get 0
      ref.func $f
      cont.new $ct
      resume $ct
    )
  )`).exports;
  assertEq(run(5), 6);
  assertEq(run(41), 42);
}

// f64 param and result (no suspend): tests base frame stub f64 loading/storing
{
  let { run } = wasmEvalText(`(module
    (type $ft (func (param f64) (result f64)))
    (type $ct (cont $ft))
    (func $f (type $ft)
      local.get 0
      f64.const 1.0
      f64.add
    )
    (elem declare func $f)
    (func (export "run") (param f64) (result f64)
      local.get 0
      ref.func $f
      cont.new $ct
      resume $ct
    )
  )`).exports;
  assertEq(run(0), 1);
  assertEq(run(2), 3);
}

// Two i32 params, returns their sum
{
  let { run } = wasmEvalText(`(module
    (type $ft (func (param i32 i32) (result i32)))
    (type $ct (cont $ft))
    (func $f (type $ft)
      local.get 0
      local.get 1
      i32.add
    )
    (elem declare func $f)
    (func (export "run") (param i32 i32) (result i32)
      local.get 0
      local.get 1
      ref.func $f
      cont.new $ct
      resume $ct
    )
  )`).exports;
  assertEq(run(3, 4), 7);
  assertEq(run(10, 32), 42);
}

// Section 2: suspend + resume with tag that has both params and results

// Tag with (param i32) (result i32): the suspended function delivers a value
// and receives a different value back when the continuation is resumed.
// Flow: run(x) -> $f suspends with (x+10) -> handler resumes with (x+10)*2
//       -> $f returns (x+10)*2 as its result.
{
  let { run } = wasmEvalText(`(module
    (type $ft (func (param i32) (result i32)))
    (type $ct (cont $ft))
    (tag $tag (param i32) (result i32))

    (func $f (type $ft)
      local.get 0
      i32.const 10
      i32.add
      suspend $tag   ;; delivers (arg+10), receives i32 back
    )
    (elem declare func $f)

    (func (export "run") (param $x i32) (result i32)
      (local $v i32)
      (local $k (ref null $ct))

      (block $on_tag (result i32 (ref $ct))
        local.get $x
        ref.func $f
        cont.new $ct
        resume $ct (on $tag 0)
        return       ;; cont returned normally (not expected here)
      )
      local.set $k
      local.set $v

      local.get $v
      i32.const 2
      i32.mul
      local.get $k
      resume $ct    ;; resume delivers (v*2) as tag result; cont returns it
    )
  )`).exports;
  assertEq(run(0), 20);  // (0+10)*2 = 20
  assertEq(run(5), 30);  // (5+10)*2 = 30
  assertEq(run(1), 22);  // (1+10)*2 = 22
}

// Tag with (param i32) (result i32), cont with matching (param i32) --
// the cont receives the tag result as its re-entry param.
// $f suspends delivering its arg, receives a new value back, stores it in a
// global.
{
  let { run, getG } = wasmEvalText(`(module
    (type $ft (func (param i32)))
    (type $ct (cont $ft))
    (tag $tag (param i32) (result i32))
    (global $g (mut i32) (i32.const 0))

    (func $f (type $ft)
      local.get 0
      suspend $tag    ;; delivers arg, gets i32 back
      global.set $g   ;; store the returned value
    )
    (elem declare func $f)

    (func (export "run") (param $init i32) (param $reply i32)
      (local $v i32)
      (local $k (ref null $ct))
      (block $on_tag (result i32 (ref $ct))
        local.get $init
        ref.func $f
        cont.new $ct
        resume $ct (on $tag 0)
        return
      )
      local.set $k
      local.set $v

      local.get $reply
      local.get $k
      resume $ct ;; resume: pass $reply as the tag result; $f stores it
    )
    (func (export "getG") (result i32) global.get $g)
  )`).exports;
  run(10, 99);
  assertEq(getG(), 99);
  run(5, 7);
  assertEq(getG(), 7);
}

// f64 tag param only (no result): tests handlersResultArea stores f64 correctly.
// $f suspends with f64 tag param; handler stores it in a global.
{
  let { run, getG } = wasmEvalText(`(module
    (type $ft (func))
    (type $ct (cont $ft))
    (tag $tag (param f64))
    (global $g (mut f64) (f64.const 0))
    (func $f (type $ft)
      f64.const 3.141592653589793
      suspend $tag
    )
    (elem declare func $f)
    (func (export "run") (param $reply f64)
      (local $v f64)
      (local $k (ref null $ct))
      (block $on_tag (result f64 (ref $ct))
        ref.func $f
        cont.new $ct
        resume $ct (on $tag 0)
        return
      )
      local.set $k
      local.set $v
      local.get $v
      global.set $g
      local.get $k
      resume $ct
    )
    (func (export "getG") (result f64) global.get $g)
  )`).exports;
  run(0);
  assertEq(getG(), Math.PI);
}

// f64 tag result only (no tag params): isolates the EmitSuspend copy for f64.
// $f drops its initial f64 arg, suspends delivering nothing, receives f64 back.
{
  let { run } = wasmEvalText(`(module
    (type $ft (func (param f64) (result f64)))
    (type $ct (cont $ft))
    (tag $tag (result f64))
    (func $f (type $ft)
      local.get 0
      drop
      suspend $tag
    )
    (elem declare func $f)
    (func (export "run") (result f64)
      (local $k (ref null $ct))
      (block $on_tag (result (ref $ct))
        f64.const 0
        ref.func $f
        cont.new $ct
        resume $ct (on $tag 0)
        return
      )
      local.set $k
      f64.const 3.141592653589793
      local.get $k
      resume $ct
    )
  )`).exports;
  assertEq(run(), Math.PI);
}

// Section 3: suspend tag results with non-pointer-sized types (i64, f32, f64)
// These exercise the word-count copy loop in EmitSuspend for types larger or
// differently-sized than a pointer.

// i64 tag result: suspend delivers i64, receives i64 back
{
  let { run } = wasmEvalText(`(module
    (type $ft (func (param i64) (result i64)))
    (type $ct (cont $ft))
    (tag $tag (param i64) (result i64))

    (func $f (type $ft)
      local.get 0
      i64.const 0x100000001
      i64.add
      suspend $tag
    )
    (elem declare func $f)

    (func (export "run") (param $x i64) (result i64)
      (local $v i64)
      (local $k (ref null $ct))
      (block $on_tag (result i64 (ref $ct))
        local.get $x
        ref.func $f
        cont.new $ct
        resume $ct (on $tag 0)
        return
      )
      local.set $k
      local.set $v
      local.get $v
      i64.const 2
      i64.mul
      local.get $k
      resume $ct
    )
  )`).exports;
  assertEq(run(0n), (0n + 0x100000001n) * 2n);
  assertEq(run(5n), (5n + 0x100000001n) * 2n);
}

// f32 tag result
{
  let { run } = wasmEvalText(`(module
    (type $ft (func (param f32) (result f32)))
    (type $ct (cont $ft))
    (tag $tag (param f32) (result f32))

    (func $f (type $ft)
      local.get 0
      f32.const 1.5
      f32.add
      suspend $tag
    )
    (elem declare func $f)

    (func (export "run") (param $x f32) (result f32)
      (local $v f32)
      (local $k (ref null $ct))
      (block $on_tag (result f32 (ref $ct))
        local.get $x
        ref.func $f
        cont.new $ct
        resume $ct (on $tag 0)
        return
      )
      local.set $k
      local.set $v
      local.get $v
      f32.const 2.0
      f32.mul
      local.get $k
      resume $ct
    )
  )`).exports;
  assertEq(run(0), (0 + 1.5) * 2);   // 3.0
  assertEq(run(1), (1 + 1.5) * 2);   // 5.0
}

// f64 tag result
{
  let { run } = wasmEvalText(`(module
    (type $ft (func (param f64) (result f64)))
    (type $ct (cont $ft))
    (tag $tag (param f64) (result f64))

    (func $f (type $ft)
      local.get 0
      f64.const 3.141592653589793
      f64.add
      suspend $tag
    )
    (elem declare func $f)

    (func (export "run") (param $x f64) (result f64)
      (local $v f64)
      (local $k (ref null $ct))
      (block $on_tag (result f64 (ref $ct))
        local.get $x
        ref.func $f
        cont.new $ct
        resume $ct (on $tag 0)
        return
      )
      local.set $k
      local.set $v
      local.get $v
      f64.const 2.0
      f64.mul
      local.get $k
      resume $ct
    )
  )`).exports;
  assertEq(run(0), (0 + Math.PI) * 2);
  assertEq(run(1), (1 + Math.PI) * 2);
}

// v128 tag result (two machine words on 64-bit, four on 32-bit).
// v128 cannot cross the JS/wasm boundary, so the test lives entirely in wasm
// and returns an i32 extracted from the final v128. The cont type has a v128
// param so that resume always takes v128 (both initial call and tag resumption).
if (wasmSimdEnabled()) {
  let { run } = wasmEvalText(`(module
    (type $ft (func (param v128) (result i32)))
    (type $ct (cont $ft))
    (tag $tag (param v128) (result v128))

    ;; $f: takes v128 param, suspends delivering it, receives v128 tag result
    ;; back, adds [10,20,30,40] and extracts lane 0 as i32.
    (func $f (type $ft)
      local.get 0
      suspend $tag
      v128.const i32x4 10 20 30 40
      i32x4.add
      i32x4.extract_lane 0
    )
    (elem declare func $f)

    (func (export "run") (result i32)
      (local $v v128)
      (local $k (ref null $ct))
      (block $on_tag (result v128 (ref $ct))
        v128.const i32x4 1 2 3 4   ;; initial cont param
        ref.func $f
        cont.new $ct
        resume $ct (on $tag 0)     ;; takes (v128, cont_ref)
        return
      )
      local.set $k
      local.set $v
      ;; $v = [1,2,3,4]; resume with [100,200,300,400] as tag result
      v128.const i32x4 100 200 300 400
      local.get $k
      resume $ct
    )
  )`).exports;
  // $f receives tag result [100,200,300,400], adds [10,20,30,40] -> lane 0 = 110
  assertEq(run(), 110);
}

// Three continuation types used in a single function: empty, three params, one result.
{
  let { run } = wasmEvalText(`(module
    (type $ft0 (func))
    (type $ct0 (cont $ft0))

    (type $ft3p (func (param i32 f64 i64)))
    (type $ct3p (cont $ft3p))

    (type $ft1r (func (result i32)))
    (type $ct1r (cont $ft1r))

    ;; Empty cont: does nothing.
    (func $empty (type $ft0))

    ;; Three-param cont: stores params into memory.
    (func $store3 (type $ft3p)
      i32.const 0
      local.get 0
      i32.store offset=0
      i32.const 0
      local.get 1
      f64.store offset=8
      i32.const 0
      local.get 2
      i64.store offset=16
    )

    ;; One-result cont: loads i32 result from memory.
    (func $load1 (type $ft1r)
      i32.const 0
      i32.load offset=0
    )

    (memory 1)
    (elem declare func $empty $store3 $load1)

    (func (export "run") (param i32 f64 i64) (result i32)
      ;; Resume empty cont.
      ref.func $empty
      cont.new $ct0
      resume $ct0

      ;; Resume three-param cont: writes params to memory.
      local.get 0
      local.get 1
      local.get 2
      ref.func $store3
      cont.new $ct3p
      resume $ct3p

      ;; Resume one-result cont: reads i32 from memory.
      ref.func $load1
      cont.new $ct1r
      resume $ct1r
    )
  )`).exports;
  assertEq(run(42, Math.PI, 0x100000001n), 42);
}

// Two coroutines with cont args, cont results, tag params, and tag results —
// exercises all four cont params/results data paths in one test.
//
// gen1(seed): yields seed, seed+1, seed+2 via $yield1 (param i32, no result);
//   gen1's cont type changes after suspend ($ct → $ct1b) because the tag has
//   no result.  Returns the final seed value.
//
// gen2(seed): yields seed, seed+delta1, seed+delta1+delta2 via $yield2
//   (param i32, result i32); the driver feeds each delta back through the
//   tag result (suspendResultsArea path).  Returns the final seed value.
//
// gen1(1)  → yields 1, 2, 3, returns 3
// gen2(10) → yields 10, 12, 8 (deltas +2, -4), returns 8
//
// Driver: (1+10)*(2+12)*(3+8) + gen1_ret + gen2_ret = 11*14*11 + 3 + 8 = 1705
//
// $startGen2 only does cont.new and returns the ref; the initial resume with
// seed happens in the driver, showing cont.new and first resume can be in
// different functions.
{
  let { run } = wasmEvalText(`(module
    (type $ft   (func (param i32) (result i32)))
    (type $ct   (cont $ft))
    (type $ft1b (func (result i32)))
    (type $ct1b (cont $ft1b))
    (tag $yield1 (param i32))
    (tag $yield2 (param i32) (result i32))

    (func $gen1 (type $ft) (local $s i32)
      local.get 0  local.tee $s                          suspend $yield1
      local.get $s  i32.const 1  i32.add  local.tee $s   suspend $yield1
      local.get $s  i32.const 1  i32.add  local.tee $s   suspend $yield1
      local.get $s
    )
    (func $gen2 (type $ft) (local $s i32)
      local.get 0  local.tee $s          suspend $yield2
      local.get $s  i32.add  local.tee $s  suspend $yield2
      local.get $s  i32.add  local.tee $s  suspend $yield2
      drop
      local.get $s
    )
    (elem declare func $gen1 $gen2)

    (func $startGen2 (result (ref $ct))
      ref.func $gen2
      cont.new $ct
    )
    (func $next2 (param $reply i32) (param $k (ref $ct)) (result i32 (ref $ct))
      (block $on_yield (result i32 (ref $ct))
        local.get $reply
        local.get $k
        resume $ct (on $yield2 0)
        unreachable
      )
    )
    (func $finish1 (param $k (ref $ct1b)) (result i32)
      (block $on_yield (result i32 (ref $ct1b))
        local.get $k
        resume $ct1b (on $yield1 0)
        return
      )
      unreachable
    )

    (func (export "run") (result i32)
      (local $k1 (ref null $ct1b))
      (local $k2 (ref null $ct))
      (local $v1 i32)
      (local $v2 i32)
      (local $prod i32)
      (local $r1 i32)
      (local $r2 i32)

      (block $init1 (result i32 (ref $ct1b))
        i32.const 1
        ref.func $gen1
        cont.new $ct
        resume $ct (on $yield1 0)
        unreachable
      )
      local.set $k1  local.set $v1

      (block $init2 (result i32 (ref $ct))
        i32.const 10
        call $startGen2
        resume $ct (on $yield2 0)
        unreachable
      )
      local.set $k2  local.set $v2

      local.get $v1  local.get $v2  i32.add  local.set $prod

      (block $next1_a (result i32 (ref $ct1b))
        local.get $k1  ref.as_non_null
        resume $ct1b (on $yield1 0)
        unreachable
      )
      local.set $k1  local.set $v1
      i32.const 2  local.get $k2  ref.as_non_null  call $next2
      local.set $k2  local.set $v2
      local.get $prod  local.get $v1  local.get $v2  i32.add  i32.mul
      local.set $prod

      (block $next1_b (result i32 (ref $ct1b))
        local.get $k1  ref.as_non_null
        resume $ct1b (on $yield1 0)
        unreachable
      )
      local.set $k1  local.set $v1
      i32.const -4  local.get $k2  ref.as_non_null  call $next2
      local.set $k2  local.set $v2
      local.get $prod  local.get $v1  local.get $v2  i32.add  i32.mul
      local.set $prod

      local.get $k1  ref.as_non_null  call $finish1  local.set $r1

      (block $finish2_done (result i32)
        (block $finish2_on_yield (result i32 (ref $ct))
          i32.const 0
          local.get $k2  ref.as_non_null
          resume $ct (on $yield2 0)
          br $finish2_done
        )
        unreachable
      )
      local.set $r2

      local.get $prod  local.get $r1  i32.add  local.get $r2  i32.add
    )
  )`).exports;
  assertEq(run(), 11 * 14 * 11 + 3 + 8);  // 1705
}

// Cont type with three results: two go via the stack-results hidden-arg ABI,
// one in a register.  Verify all three values survive the cont base frame stub.
{
  let { run } = wasmEvalText(`(module
    (type $ft3r (func (result i32 i64 f64)))
    (type $ct3r (cont $ft3r))
    (func $f (type $ft3r)
      i32.const 42
      i64.const 0x100000001
      f64.const 2.718281828
    )
    (elem declare func $f)
    (func (export "run") (result i32 i64 f64)
      ref.func $f
      cont.new $ct3r
      resume $ct3r
    )
  )`).exports;
  let [a, b, c] = run();
  assertEq(a, 42);
  assertEq(b, 0x100000001n);
  assertEq(Math.abs(c - 2.718281828) < 1e-9, true);
}

// Section 4: pathological cases with many params and results. These force the
// base frame stub to spill params/results beyond the ABI registers onto the
// stack areas.

// Many i32 cont params: the cont sums them (sum 1..N == N*(N+1)/2).
{
  const N = 24;
  const ptypes = Array(N).fill('i32').join(' ');
  let sum = 'local.get 0\n';
  for (let i = 1; i < N; i++) sum += `local.get ${i}\ni32.add\n`;
  let args = '';
  for (let i = 0; i < N; i++) args += `i32.const ${i + 1}\n`;
  let { run } = wasmEvalText(`(module
    (type $ft (func (param ${ptypes}) (result i32)))
    (type $ct (cont $ft))
    (func $f (type $ft) ${sum})
    (elem declare func $f)
    (func (export "run") (result i32)
      ${args}
      ref.func $f
      cont.new $ct
      resume $ct)
  )`).exports;
  assertEq(run(), (N * (N + 1)) / 2);
}

// Many i32 cont results: the cont produces N values, the caller sums them.
{
  const N = 24;
  const rtypes = Array(N).fill('i32').join(' ');
  let produce = '';
  for (let i = 0; i < N; i++) produce += `i32.const ${i + 1}\n`;
  let { run } = wasmEvalText(`(module
    (type $ft (func (result ${rtypes})))
    (type $ct (cont $ft))
    (func $f (type $ft) ${produce})
    (elem declare func $f)
    (func (export "run") (result i32)
      ref.func $f
      cont.new $ct
      resume $ct
      ${'i32.add\n'.repeat(N - 1)})
  )`).exports;
  assertEq(run(), (N * (N + 1)) / 2);
}

// Many mixed-type params AND results echoed back: stresses the base frame stub
// loading params and storing results across the register/stack ABI split for
// all three numeric classes at once.
{
  const K = 6; // K groups of (i32 i64 f64) -> 3*K params and results
  const group = 'i32 i64 f64';
  const types = Array(K).fill(group).join(' ');
  let echo = '';
  for (let i = 0; i < 3 * K; i++) echo += `local.get ${i}\n`;
  let args = '';
  for (let i = 0; i < K; i++) {
    args += `i32.const ${i}\ni64.const ${i + 100}\nf64.const ${i + 0.5}\n`;
  }
  let { run } = wasmEvalText(`(module
    (type $ft (func (param ${types}) (result ${types})))
    (type $ct (cont $ft))
    (func $f (type $ft) ${echo})
    (elem declare func $f)
    (func (export "run") (result ${types})
      ${args}
      ref.func $f
      cont.new $ct
      resume $ct)
  )`).exports;
  let r = run();
  for (let i = 0; i < K; i++) {
    assertEq(r[3 * i], i);
    assertEq(r[3 * i + 1], BigInt(i + 100));
    assertEq(Math.abs(r[3 * i + 2] - (i + 0.5)) < 1e-9, true);
  }
}
