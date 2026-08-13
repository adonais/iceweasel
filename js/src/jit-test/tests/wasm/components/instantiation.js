// |jit-test| skip-if: !wasmComponentsEnabled()

assertErrorMessage(
  () => new WebAssembly.ComponentInstance(),
  TypeError, /argument required/,
);
assertErrorMessage(
  () => new WebAssembly.ComponentInstance(123),
  TypeError, /first argument must be a WebAssembly.Component/,
);
new WebAssembly.ComponentInstance(
  new WebAssembly.Component(wasmTextToBinary(`(component)`)),
);

// All instances get instantiated even if unused.
new WebAssembly.ComponentInstance(
  new WebAssembly.Component(wasmTextToBinary(`
    (component
      (core module)
      (core module
        (func $start unreachable)
        (start $start)
      )
      (core module)

      (core instance (instantiate 0))
      ;; (core instance (instantiate 1))
      (core instance (instantiate 2))
    )
  `)),
);
assertErrorMessage(() => {
  new WebAssembly.ComponentInstance(
    new WebAssembly.Component(wasmTextToBinary(`
      (component
        (core module)
        (core module
          (func $start unreachable)
          (start $start)
        )
        (core module)

        (core instance (instantiate 0))
        (core instance (instantiate 1))
        (core instance (instantiate 2))
      )
    `)),
  );
}, WebAssembly.RuntimeError, /unreachable/);

// Basic plumbing of exports and imports succeeds.
{
  const i = new WebAssembly.ComponentInstance(
    new WebAssembly.Component(wasmTextToBinary(`
      (component
        (core module
          (func (export "func") (result i32) i32.const 123)
          (table (export "table") 1 1 funcref)
          (memory (export "memory") 1 1)
          (global (export "global") (mut i32) i32.const 234)
          (tag (export "tag"))

          (func $start
            (f32.store (i32.const 0) (f32.const 345))
          )
          (start $start)

          (func $456 (result i32) i32.const 456)
          (elem (offset (i32.const 0)) func $456)
        )
        (core module
          (type (func (result i32)))

          (import "env" "func" (func (result i32)))
          (import "env" "table" (table 1 1 funcref))
          (import "env" "memory" (memory 1 1))
          (import "env" "global" (global (mut i32)))
          (import "env" "tag" (tag))

          (func (export "test123") (result i32)
            call 0
          )
          (func (export "test234") (result i32)
            global.get 0
          )
          (func (export "test345") (result f32)
            (f32.load (i32.const 0))
          )
          (func (export "test456") (result i32)
            (call_indirect (type 0) (i32.const 0))
          )
        )
        (core instance (instantiate 0))
        (core instance (instantiate 1 (with "env" (instance 0))))
      )
    `)),
  );
  const { test123, test234, test345, test456 } = wasmComponentCoreInstance(i, 1).exports;
  assertEq(test123(), 123);
  assertEq(test234(), 234);
  assertEq(test345(), 345);
  assertEq(test456(), 456);
}

// Canon definitions that generate core functions validate but crash for now
// TODO(wasm-cm): Update / remove these tests when adding instantiation support
// for: canon lower, canon resource.new/drop/rep
{
  const i = new WebAssembly.ComponentInstance(
    new WebAssembly.Component(wasmTextToBinary(`
      (component
        (core module $Base
          (memory (export "mem") 1 1)
          (func (export "dtor") (param i32))
          (func (export "cool") (param f32))
          (func (export "uncool") (result f64) f64.const 123)
        )
        (core instance $base (instantiate $Base))

        (type $R (resource (rep i32) (dtor (func $base "dtor"))))
        (core func $R_new (canon resource.new $R))
        (core func $R_rep (canon resource.rep $R))
        (core func $R_drop (canon resource.drop $R))

        (func $cool_lifted (param "x" f32)
          (canon lift (core func $base "cool"))
        )
        (core func $cool_lowered (canon lower (func $cool_lifted)))

        (core module $Main
          (import "" "mem" (memory 1 1))
          (import "" "R_new_orig" (func $R_new (param i32) (result i32)))
          (import "" "R_rep_orig" (func $R_rep (param i32) (result i32)))
          (import "" "R_drop_orig" (func $R_drop (param i32)))
          (import "" "cool_orig" (func $cool (param f32)))
          (import "" "uncool_orig" (func $uncool (result f64)))

          (export "R_new" (func $R_new))
          (export "R_rep" (func $R_rep))
          (export "R_drop" (func $R_drop))
          (export "cool" (func $cool))
          (export "uncool" (func $uncool))
        )
        (core instance (instantiate $Main
          (with "" (instance
            (export "mem" (memory $base "mem"))
            (export "R_new_orig" (func $R_new))
            (export "R_rep_orig" (func $R_rep))
            (export "R_drop_orig" (func $R_drop))
            (export "cool_orig" (func $cool_lowered))
            (export "uncool_orig" (func $base "uncool"))
          ))
        ))
      )
    `)),
  );
  const { R_new, R_rep, R_drop, cool, uncool } = wasmComponentCoreInstance(i, 2).exports;
  assertErrorMessage(() => R_new(1), WebAssembly.RuntimeError, /unreachable/);
  assertErrorMessage(() => R_rep(1), WebAssembly.RuntimeError, /unreachable/);
  assertErrorMessage(() => R_drop(1), WebAssembly.RuntimeError, /unreachable/);
  assertErrorMessage(() => cool(), WebAssembly.RuntimeError, /unreachable/);
  assertEq(uncool(), 123);
}

// Multiple aliases of the same core export should probably be allowed.
{
  const i = new WebAssembly.ComponentInstance(
    new WebAssembly.Component(wasmTextToBinary(`
      (component
        (core module $M
          (func (export "foo") (result i32) i32.const 123)
        )
        (core instance $I (instantiate $M))

        (alias core export $I "foo" (core func $a1))
        (alias core export $I "foo" (core func $a2))

        (core module $Test
          (import "" "a1" (func (result i32)))
          (import "" "a2" (func (result i32)))
          (func (export "test") (result i32)
            call 0
            call 1
            i32.add
          )
        )
        (core instance $test (instantiate $Test
          (with "" (instance
            (export "a1" (func $a1))
            (export "a2" (func $a2))
          ))
        ))
      )
    `)),
  );
  const { test } = wasmComponentCoreInstance(i, 2).exports;
  assertEq(test(), 246);
}

// The same module can be instantiated twice.
{
  const i = new WebAssembly.ComponentInstance(
    new WebAssembly.Component(wasmTextToBinary(`
      (component
        (core module $M
          (global $g (mut i32) (i32.const 0))
          (func (export "get") (result i32)
            global.get $g
          )
          (func (export "add") (param i32)
            (global.set $g (i32.add (global.get $g) (local.get 0)))
          )
        )
        (core instance (instantiate $M))
        (core instance (instantiate $M))
      )
    `)),
  );
  const i0 = wasmComponentCoreInstance(i, 0).exports;
  const i1 = wasmComponentCoreInstance(i, 1).exports;
  i0.add(1);
  i1.add(2);
  assertEq(i0.get(), 1);
  assertEq(i1.get(), 2);
  assertEq(i0.get === i1.get, false);  // distinct export objects
}

// Object identity is what it should be.
{
  const i = new WebAssembly.ComponentInstance(
    new WebAssembly.Component(wasmTextToBinary(`
      (component
        (core module $A
          (global (export "g") (mut i32) (i32.const 10))
          (memory (export "mem") 1 1)
          (func (export "getG") (result i32)
            global.get 0
          )
          (func (export "getMem") (result i32)
            (i32.load (i32.const 0))
          )
        )
        (core module $B
          (import "a" "g" (global (mut i32)))
          (import "a" "mem" (memory 1 1))
          (func $start
            (global.set 0 (i32.const 20))
            (i32.store (i32.const 0) (i32.const 99))
          )
          (start $start)
          (export "g" (global 0))
          (export "mem" (memory 0))
        )
        (core instance $a (instantiate $A))
        (core instance $b (instantiate $B (with "a" (instance $a))))
      )
    `)),
  );
  const a = wasmComponentCoreInstance(i, 0).exports;
  const b = wasmComponentCoreInstance(i, 1).exports;
  assertEq(a.g, b.g);        // same WebAssembly.Global object
  assertEq(a.mem, b.mem);    // same WebAssembly.Memory object
  assertEq(a.getG(), 20);    // B's start mutated the shared global; A observes it
  assertEq(a.getMem(), 99);  // B's start wrote to memory; A observes it
}

// Instantiation occurs in order of `core instance` definitions.
{
  const i = new WebAssembly.ComponentInstance(
    new WebAssembly.Component(wasmTextToBinary(`
      (component
        ;; Each module stores the current value of the "counter" global in a
        ;; unique spot in memory at instantiation time.
        (core module $A
          (memory (export "mem") 1 1)
          (global (export "counter") (mut i32) (i32.const 0))
          (func $start
            (i32.store (i32.const 0) (global.get 0))
            (global.set 0 (i32.add (global.get 0) (i32.const 1)))
          )
          (start $start)
        )
        (core module $B
          (import "a" "mem" (memory 1 1))
          (import "a" "counter" (global (mut i32)))
          (func $start
            (i32.store (i32.const 4) (global.get 0))
            (global.set 0 (i32.add (global.get 0) (i32.const 1)))
          )
          (start $start)
        )
        (core module $C
          (import "a" "mem" (memory 1 1))
          (import "a" "counter" (global (mut i32)))
          (func $start
            (i32.store (i32.const 8) (global.get 0))
            (global.set 0 (i32.add (global.get 0) (i32.const 1)))
          )
          (start $start)
        )

        ;; NOTE: Instantiating C before B
        (core instance $a (instantiate $A))
        (core instance $c (instantiate $C (with "a" (instance $a))))
        (core instance $b (instantiate $B (with "a" (instance $a))))
      )
    `)),
  );
  const a = wasmComponentCoreInstance(i, 0).exports;
  const mem = new Int32Array(a.mem.buffer);
  assertEq(mem[0], 0);           // A saw counter == 0
  assertEq(mem[1], 2);           // B saw counter == 2 (byte 4)
  assertEq(mem[2], 1);           // C saw counter == 1 (byte 8)
  assertEq(a.counter.value, 3);  // A, B and C each incremented the shared counter
}

// Test inline exports of all core kinds.
{
  const i = new WebAssembly.ComponentInstance(
    new WebAssembly.Component(wasmTextToBinary(`
      (component
        (core module $M
          (func (export "f") (result i32) i32.const 111)
          (func $tgt (result i32) i32.const 222)
          (table (export "t") funcref (elem $tgt))
          (memory (export "m") (data "\\2a\\00\\00\\00"))
          (global (export "g") (mut i32) (i32.const 333))
          (tag (export "tag"))
        )
        (core instance $I (instantiate $M))
        (core instance $bundle
          (export "f" (func $I "f"))
          (export "t" (table $I "t"))
          (export "m" (memory $I "m"))
          (export "g" (global $I "g"))
          (export "tag" (tag $I "tag"))
        )
        (core module $Use
          (type $t (func (result i32)))
          (import "" "f" (func (result i32)))
          (import "" "t" (table 1 1 funcref))
          (import "" "m" (memory 1 1))
          (import "" "g" (global (mut i32)))
          (import "" "tag" (tag))
          (func (export "callF") (result i32)
            call 0
          )
          (func (export "callIndirect") (result i32)
            (call_indirect (type $t) (i32.const 0))
          )
          (func (export "loadMem") (result i32)
            (i32.load (i32.const 0))
          )
          (func (export "getG") (result i32)
            global.get 0
          )
          (export "tag" (tag 0))
        )
        (core instance $use (instantiate $Use (with "" (instance $bundle))))
      )
    `)),
  );
  const src = wasmComponentCoreInstance(i, 0).exports;
  const use = wasmComponentCoreInstance(i, 2).exports;
  assertEq(use.callF(), 111);
  assertEq(use.callIndirect(), 222);
  assertEq(use.loadMem(), 42);
  assertEq(use.getG(), 333);
  assertEq(use.tag, src.tag);  // tag resolved through the inline-export core-export alias
}

// Both mutable and immutable globals are correctly instantiated.
{
  const i = new WebAssembly.ComponentInstance(
    new WebAssembly.Component(wasmTextToBinary(`
      (component
        (core module $M
          (global (export "g1") i32 (i32.const 333))
          (global (export "g2") (mut i32) (i32.const 444))
        )
        (core instance $I (instantiate $M))
        (core module $Use
          (import "" "g1" (global i32))
          (import "" "g2" (global (mut i32)))
          (func (export "getG1") (result i32) (global.get 0))
          (func (export "getG2") (result i32) (global.get 1))
        )
        (core instance (instantiate $Use (with "" (instance $I))))
      )
    `)),
  );
  assertEq(wasmComponentCoreInstance(i, 1).exports.getG1(), 333);
  assertEq(wasmComponentCoreInstance(i, 1).exports.getG2(), 444);
}

// Chains of inline exports resolve to the same thing and instantiate correctly.
{
  const i = new WebAssembly.ComponentInstance(
    new WebAssembly.Component(wasmTextToBinary(`
      (component
        (core module $M
          (func (export "foo") (result i32)
            i32.const 123
          )
        )
        (core instance $A (instantiate $M))
        (core instance $B (export "foo" (func $A "foo")))
        (core instance $C (export "foo" (func $B "foo")))
        (core instance $D (export "foo" (func $C "foo")))
        (core module $Test
          (import "a" "foo" (func (result i32)))
          (import "b" "foo" (func (result i32)))
          (import "c" "foo" (func (result i32)))
          (import "d" "foo" (func (result i32)))
          (func (export "runA") (result i32) call 0)
          (func (export "runB") (result i32) call 1)
          (func (export "runC") (result i32) call 2)
          (func (export "runD") (result i32) call 3)
        )
        (core instance (instantiate $Test
          (with "a" (instance $A))
          (with "b" (instance $B))
          (with "c" (instance $C))
          (with "d" (instance $D))
        ))
      )
    `)),
  );
  assertEq(wasmComponentCoreInstance(i, 4).exports.runA(), 123);
  assertEq(wasmComponentCoreInstance(i, 4).exports.runB(), 123);
  assertEq(wasmComponentCoreInstance(i, 4).exports.runC(), 123);
  assertEq(wasmComponentCoreInstance(i, 4).exports.runD(), 123);
}
