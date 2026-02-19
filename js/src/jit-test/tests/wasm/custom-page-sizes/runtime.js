// |jit-test| skip-if: !wasmCustomPageSizesEnabled()

// Test access to an index from a local.
{
  let instance = wasmEvalText(`(module
      (memory i32 10 10 (pagesize 1))
      (func (export "f") (param i32) (result i32)
        (i32.store (local.get 0) (i32.const 42))
        (i32.load (local.get 0))
      )
    )
  `);

  assertEq(instance.exports.f(5), 42);
}

// Test constant memory access.
{
  let instance = wasmEvalText(`(module
      (memory i32 10 10 (pagesize 1))
      (func (export "f") (result i32)
        (i32.store (i32.const 5) (i32.const 42))
        (i32.load (i32.const 5))
      )
    )
  `);

  assertEq(instance.exports.f(), 42);
}

// Test bounds checks with various offsets.
{
  let instance = wasmEvalText(`(module
      (memory i32 10 10 (pagesize 1))
      (func (export "f") (param i32)
        (i32.store8 offset=1 (local.get 0) (i32.const 42))
      )
    )
  `);

  instance.exports.f(1);
  instance.exports.f(8);
  assertErrorMessage(() => instance.exports.f(9), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(10), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 20 20 (pagesize 1))
      (func (export "f") (param i32)
        (i32.store8 offset=17 (local.get 0) (i32.const 42))
      )
    )
  `);

  instance.exports.f(0);
  instance.exports.f(2);
  assertErrorMessage(() => instance.exports.f(3), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(10), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(19), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 20 20 (pagesize 1))
      (func (export "f") (param i32)
        (i32.store offset=2 (local.get 0) (i32.const 42))
      )
    )
  `);

  instance.exports.f(0);
  instance.exports.f(14);
  assertErrorMessage(() => instance.exports.f(15), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(19), WebAssembly.RuntimeError, "index out of bounds");
}

// Test bounds checks with various access sizes.
{
  let instance = wasmEvalText(`(module
      (memory i32 10 10 (pagesize 1))
      (func (export "f") (param i32)
        (i32.store8 (local.get 0) (i32.const 42))
      )
    )
  `);

  instance.exports.f(1);
  instance.exports.f(3);
  instance.exports.f(9);
  assertErrorMessage(() => instance.exports.f(10), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 10 10 (pagesize 1))
      (func (export "f") (param i32)
        (i32.store16 (local.get 0) (i32.const 42))
      )
    )
  `);

  instance.exports.f(1);
  instance.exports.f(3);
  assertErrorMessage(() => instance.exports.f(9), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(10), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 10 10 (pagesize 1))
      (func (export "f") (param i32)
        (i32.store (local.get 0) (i32.const 42))
      )
    )
  `);

  instance.exports.f(1);
  instance.exports.f(6);
  assertErrorMessage(() => instance.exports.f(7), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(8), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(9), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(10), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 10 10 (pagesize 1))
      (func (export "f") (param i32)
        (i64.store (local.get 0) (i64.const 42))
      )
    )
  `);

  instance.exports.f(1);
  instance.exports.f(2);
  assertErrorMessage(() => instance.exports.f(3), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(4), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(5), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(6), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(7), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(8), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(9), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(10), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 20 20 (pagesize 1))
      (func (export "f") (param i32) (result i32)
        (i32x4.extract_lane 0 (v128.load (local.get 0)))
      )
    )
  `);

  instance.exports.f(1);
  instance.exports.f(4);
  assertErrorMessage(() => instance.exports.f(5), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(10), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(15), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(20), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 0 0 (pagesize 1))
      (func (export "f") (param i32)
        (i64.store8 (local.get 0) (i64.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(0), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(1), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 0 0 (pagesize 1))
      (func (export "f") (param i32)
        (i64.store16 (local.get 0) (i64.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(0), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(1), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 0 0 (pagesize 1))
      (func (export "f") (param i32)
        (i32.store (local.get 0) (i32.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(0), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(1), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 0 0 (pagesize 1))
      (func (export "f") (param i32)
        (i64.store (local.get 0) (i64.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(0), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(1), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i64 0 0 (pagesize 1))
      (func (export "f") (param i64) (result i32)
        (i32x4.extract_lane 0 (v128.load (local.get 0)))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(0n), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(1n), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(2n), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 1 1 (pagesize 1))
      (func (export "f") (param i32)
        (i64.store16 (local.get 0) (i64.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(0), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(1), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(2), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 2 2 (pagesize 1))
      (func (export "f") (param i32)
        (i64.store16 (local.get 0) (i64.const 42))
      )
    )
  `);

  instance.exports.f(0);
  assertErrorMessage(() => instance.exports.f(1), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(2), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 4 4 (pagesize 1))
      (func (export "f") (param i32)
        (i64.store32 (local.get 0) (i64.const 42))
      )
    )
  `);

  instance.exports.f(0);
  assertErrorMessage(() => instance.exports.f(1), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(2), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 8 8 (pagesize 1))
      (func (export "f") (param i32)
        (i64.store (local.get 0) (i64.const 42))
      )
    )
  `);

  instance.exports.f(0);
  assertErrorMessage(() => instance.exports.f(1), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(2), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i64 16 16 (pagesize 1))
      (func (export "f") (param i64) (result i32)
        (i32x4.extract_lane 0 (v128.load (local.get 0)))
      )
    )
  `);

  instance.exports.f(0n);
  assertErrorMessage(() => instance.exports.f(1n), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(2n), WebAssembly.RuntimeError, "index out of bounds");
}

// Test ARM-related cases
{
  let instance = wasmEvalText(`(module
      (memory i32 69648 69648 (pagesize 1))
      (func (export "f") (param i32)
        (i32.store8 (local.get 0) (i32.const 42))
      )
    )
  `);

  instance.exports.f(0)
  instance.exports.f(69647)
  assertErrorMessage(() => instance.exports.f(69648), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(69649), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i64 69648 69648 (pagesize 1))
      (func (export "f") (param i64)
        (i32.store8 (local.get 0) (i32.const 42))
      )
    )
  `);

  instance.exports.f(0n)
  instance.exports.f(69647n)
  assertErrorMessage(() => instance.exports.f(69648n), WebAssembly.RuntimeError, "index out of bounds");
  assertErrorMessage(() => instance.exports.f(69649n), WebAssembly.RuntimeError, "index out of bounds");
}

// Test bounds checking under 4GB.
{
  let instance = wasmEvalText(`(module
      (memory i64 5000 10000 (pagesize 1))
      (func (export "f")
        (i32.store (i64.const 11000) (i32.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i64 5000 (pagesize 1))
      (func (export "f")
        (i32.store (i64.const 11000) (i32.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i64 5000 128000 (pagesize 1))
      (func (export "f")
        (i32.store (i64.const 64000) (i32.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i64 5000 10000 (pagesize 1))
      (func (export "f")
        (i32.store (i64.const 6000) (i32.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 5000 10000 (pagesize 1))
      (func (export "f")
        (i32.store (i32.const 11000) (i32.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 5000 128000 (pagesize 1))
      (func (export "f")
        (i32.store (i32.const 64000) (i32.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(), WebAssembly.RuntimeError, "index out of bounds");
}

{
  let instance = wasmEvalText(`(module
      (memory i32 5000 10000 (pagesize 1))
      (func (export "f")
        (i32.store (i32.const 6000) (i32.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(), WebAssembly.RuntimeError, "index out of bounds");
}

if (getBuildConfiguration("x86")) {
  assertErrorMessage(
    () => wasmEvalText(`(module
        (memory i32 4294967295 4294967295 (pagesize 1))
        (func (export "f") (param i32)
          (i32.store8 (local.get 0) (i32.const 42))
        )
      )
    `),
    WebAssembly.RuntimeError,
    "too many memory pages"
  );
} else {
  {
    let instance = wasmEvalText(`(module
        (memory i32 4294967295 4294967295 (pagesize 1))
        (func (export "f") (param i32)
          (i32.store8 (local.get 0) (i32.const 42))
        )
      )
    `);

    instance.exports.f(1);
    instance.exports.f(3000);
    instance.exports.f(4294967292);
    instance.exports.f(4294967293);
    instance.exports.f(4294967294);
    assertErrorMessage(() => instance.exports.f(4294967295), WebAssembly.RuntimeError, "index out of bounds");
  }

  {
    let instance = wasmEvalText(`(module
        (memory i32 4294967295 4294967295 (pagesize 1))
        (func (export "f") (param i32)
          (i32.store16 (local.get 0) (i32.const 42))
        )
      )
    `);

    instance.exports.f(1);
    instance.exports.f(3000);
    instance.exports.f(4294967292);
    instance.exports.f(4294967293);
    assertErrorMessage(() => instance.exports.f(4294967294), WebAssembly.RuntimeError, "index out of bounds");
    assertErrorMessage(() => instance.exports.f(4294967295), WebAssembly.RuntimeError, "index out of bounds");
  }

  {
    let instance = wasmEvalText(`(module
        (memory i32 4294967295 (pagesize 1))
        (func (export "f") (param i32)
          (i32.store16 (local.get 0) (i32.const 42))
        )
      )
    `);

    instance.exports.f(1);
    instance.exports.f(3000);
    instance.exports.f(4294967292);
    instance.exports.f(4294967293);
    assertErrorMessage(() => instance.exports.f(4294967294), WebAssembly.RuntimeError, "index out of bounds");
    assertErrorMessage(() => instance.exports.f(4294967295), WebAssembly.RuntimeError, "index out of bounds");
  }
}

// Ensure bounds checking above 4GB works as expected.
if (getBuildConfiguration("x86")) {
  assertErrorMessage(
    () => wasmEvalText(`(module
        (memory i64 4294967299 4294967299 (pagesize 1))
        (func (export "f")
          (i32.store (i64.const 4294967300) (i32.const 42))
        )
      )
    `),
    WebAssembly.RuntimeError,
    "too many memory pages"
  );
} else {
  let instance = wasmEvalText(`(module
      (memory i64 4294967299 4294967299 (pagesize 1))
      (func (export "f")
        (i32.store (i64.const 4294967300) (i32.const 42))
      )
    )
  `);

  assertErrorMessage(() => instance.exports.f(), WebAssembly.RuntimeError, "index out of bounds");
}
